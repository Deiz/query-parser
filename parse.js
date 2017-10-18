"use strict";

/*
 * A general caveat here is that I'm not all that well-versed in this sort of parsing.
 * This is a simple solution that walks left-to-right across the input and spawns a
 * hierarchy of subclauses as it encounters parentheses or additional operators.
 *
 * A less fragile implementation would likely be based on a grammar (PEG perhaps) with
 * something that walks the parse tree.
 */

class Word {
   constructor(text) {
      this.text = text;
      this.quoted = false;
      this.operators = [];

      this.operatorMapping = {
         ">=": "$gte",
         "<=": "$lte",
         ">": "$gt",
         "<": "$lt",
         "=": "$eq",
         "!": "$not"
      };

      this.supportedOperators = new Set(Object.keys(this.operatorMapping));
   }
   
   static create(text) {
      const isQuoted = w => typeof w === "string" && w.startsWith("\"") && w.endsWith("\"");

      let output = new Word(text);
      let quoted = false;

      output._extract();

      quoted = isQuoted(output.text);
      if (quoted) {
         output.text = output.text.substring(1, output.text.length - 1);
      }

      output.quoted = quoted;
      return output;
   }

   // The one and only place I've resorted to regex. Used to parse operators and len(#) commands.
   _extract() {
      // Condense all unique operators into their characters, e.g. [">=", "<"] becomes
      // the character class [>=<]
      const operatorClass = [...new Set([...this.supportedOperators.values()].join(""))]
         .join("")
         .replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");

      const parseOperator = (text) => {
         if (text === "") {
            return;
         }
         else if (this.supportedOperators.has(text)) {
            this.operators.push(text);
            this.text = this.text.substring(text.length);
            return text;
         }

         throw new Error(`Unknown operator: ${text}`);
      };

      const operatorGroup = new RegExp(`^([${operatorClass}]+)`);
      let match = operatorGroup.exec(this.text);
      if (match != null) {
         let op = match[1];
         if (op.startsWith("!")) {
            this.operators.push("!");
            op = op.substring(1);
            this.text = this.text.substring(1);
         }

         if (op === "!") {
            throw new Error("The negation (!) operator may only be used at the start of an expression");
         }

         parseOperator(op);
      }

      // Inspect the remaining contents for a len(#) command
      match = /^len\((.*)\)$/.exec(this.text);
      if (match == null) {
         return;
      }
      else if (/^\d+$/.exec(match[1]) == null) {
         throw new Error(`Invalid non-numeric argument to len() command: ${match[1]}`);
      }

      this.operators.push("$len");
      this.text = this.text.substring(4, this.text.length - 1);
   }

   toJSON() {
      if (this.text === "false") {
         this.text = false;
      }
      else if (this.text === "true") {
         this.text = true;
      }
      
      let contents = this.text;
      if (this.quoted) {
         contents = { "$quoted": this.text };
      }
      else if (this.operators.length && this.operators[this.operators.length - 1] === "$len") {
         contents = parseInt(this.text, 10);
      }

      if (this.operators.length !== 0) {
         const obj = {};
         let subtree = obj;
         for (let i = 0; i < this.operators.length - 1; i++) {
            const op = this.operators[i] in this.operatorMapping
               ? this.operatorMapping[this.operators[i]]
               : this.operators[i];

            subtree[op] = {};
            subtree = subtree[op];
         }

         const last = this.operators[this.operators.length - 1];
         const op = last in this.operatorMapping
            ? this.operatorMapping[last]
            : last;

         subtree[op] = contents;
         return obj;
      }
      else {
         return this.text;
      }
   }
}

class Clause {
   constructor(type, parent) {
      this.supportedOperators = new Set(["AND", "OR"]);

      if (type != null) {
         this.setType(type);
      }
      else {
         this.type = "AND";
         this.typeSet = false;
      }

      this.children = [];
      this.elements = [];

      if (parent != null) {
         this.setParent(parent);
      }
   }

   setType(type) {
      this.typeSet = true;
      if (!this.supportedOperators.has(type)) {
         throw new Error(`Unknown type: ${type}`);
      }

      this.type = type;
   }

   setParent(parent) {
      if (this.parent != null) {
         this.parent.removeChild(this);
      }

      parent.addChild(this);
      this.parent = parent;
   }

   addChild(child) {
      this.children.push(child);
   }

   removeChild(child) {
      this.children = this.children.filter(c => c !== child);
   }

   addElement(element) {
      if (element instanceof Word) {
         this.elements.push(element);
      }
      else {
         const word = Word.create(element);
         this.elements.push(word);
      }
   }

   popElement() {
      return this.elements.pop();
   }

   toJSON() {
      // Apply some naive tree-flattening.
      const elements = this.elements.concat(this.children);
      if (elements.length === 1) {
         return elements[0].toJSON();
      }

      const obj = {};
      let key = "$and";
      if (this.type === "OR") {
         key = "$or";
      }

      obj[key] = elements;
      return obj;
   }
}

function parse(input) {
   const reserved = new Set(["(", ")", " "]);
   const terminateWord = () => {
      if (word !== "") {
         clause.addElement(word);
      }

      inCommand = false;

      word = "";
   };

   let quoted = false;
   let inCommand = false;
   let inSpawnedClause = false;
   let parenLevel = 0;
   let word = "";

   let root = new Clause();
   let clause = root;

   for (let i = 0; i < input.length; i++) {
      const c = input[i];

      // This ought to actually permit escaping, e.g. "\"foo bar\"", but that's
      // a little more complex than I want this PoC to be.
      //
      // There are also a bunch of nuances around quoting of command arguments,
      // etc. that I'm entirely ignoring.
      if (c === "\"") {
         // There's a question here around how flexible you actually want to
         // be with quotes, e.g. "foo bar" is obviously fine... but what about
         // foo" "bar, fo"o bar", etc.?
         quoted = !quoted;
      }

      // With sufficiently-large inputs, naive string appends might be too slow.
      // Possibly better replaced by look-ahead and string slicing to establish
      // word bounds.
      if (quoted) {
         word += c;
      }
      else if (input[i] === "(") {
         if (word === "") {
            parenLevel++;
            terminateWord();
            const child = new Clause(null, clause);
            clause = child;
         }
         else {
            inCommand = true;
            word += c;
         }
      }
      else if (input[i] === ")") {
         if (inCommand) {
            inCommand = false;
            word += c;
         }
         else if (parenLevel === 0) {
            throw new Error("Unbalanced parentheses");
         }
         else {
            parenLevel--;
            terminateWord();
            clause = clause.parent;
         }
      }
      else if (reserved.has(input[i])) {
         if (word != "" && new Set(["OR", "AND"]).has(word)) {
            if (!clause.typeSet) {
               clause.setType(word);
            }

            else if (inSpawnedClause && clause.type !== word) {
               clause = clause.parent;
               inSpawnedClause = false;
            }
            // AND binds more tightly than OR; a AND b OR c should yield:
            // { "$or": [{ "$and": ["a", "b"] }, { "$and": "c" }] }
            //
            // If we're in the middle of an AND clause, when an OR is encountered
            // the current clause should be re-parented with a new OR clause above.
            else if (word === "OR" && clause.type !== word) {
               const parent = new Clause(word);
               clause.setParent(parent);
               if (clause === root) {
                  root = parent;
               }
               clause = parent;
               inSpawnedClause = true;
            }
            else if (clause.type !== word && word === "AND") {
               const child = new Clause(word, clause);
               const popped = clause.popElement();
               if (popped != null) {
                  child.addElement(popped);
               }

               clause = child;
               inSpawnedClause = true;
            }
         }
         else {
            terminateWord();
         }
         word = "";
      }
      else {
         word += c;
      }

      if (i === input.length - 1) {
         if (quoted) {
            throw new Error(`Missing closing quote around string beginning with: ${word}`);
         }
         else if (parenLevel !== 0) {
            throw new Error("Expected closing parenthesis");
         }

         terminateWord();
      }
   }

   return root;
}

module.exports = exports = {
   parse: parse
};
