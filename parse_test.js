"use strict";

/*
 * Trivial happy path unit tests.
 * This would normally be in Mocha or similar, written BDD-style, with coverage
 * of any sensitive business rules guarding against regressions.
 */

const Parse = require("parse");

const inputs = {
   // Per documentation
   "error OR info": { $or: ["error", "info"] },
   ">400 <500": { $and: [{ $gt: "400" }, { $lt: "500" }] },
   "=\"TEST DATA\" OR >len(9)": { $or: [{ $eq: { $quoted: "TEST DATA" } }, { $gt: { $len: 9 } }] },
   "!false": { $not: false },

   // Additional coverage around operating stacking, nesting, etc.
   "foo bar": { $and: ["foo", "bar"] },
   "!>=300": { $not: { $gte: "300" } },
   "foo AND bar AND baz OR qux": { $or: ["qux", { $and: ["foo", "bar", "baz"] }] },
   "foo OR bar AND baz": { $or: ["foo", { $and: ["bar", "baz"] }] },
   "(foo OR x AND (!y)) AND z": { $and: ["z", { $or: ["foo", { $and: ["x", { $not: "y" }] }] } ] },
   "!=\"foo\"": { $not: { $eq: { $quoted: "foo" } } }
};

let failures = 0;

for (const query in inputs) {
   const expected = JSON.stringify(inputs[query]);
   let parsed = null;
   try {
      parsed = Parse.parse(query);
   }
   catch (err) {
      console.error(`Received an error with query: ${query}`);
      console.error(err);

      failures++;
      continue;
   }

   if (JSON.stringify(parsed) !== expected) {
      console.error(`Mismatch on query: ${query}`);
      console.error(`Expected: ${JSON.stringify(inputs[query], null, 4)}`);
      console.error(`Received: ${JSON.stringify(parsed, null, 4)}`);
      failures++;
   }
}

console.log(`\n\nRan ${Object.keys(inputs).length} tests, ${failures} failure(s)`);
