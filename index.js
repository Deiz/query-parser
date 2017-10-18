"use strict";

const express = require('express');
const Parser = require("parse");

const PORT = process.env.PORT || "8080";
const app = express();

// Ought to be handled by middleware
class RequestError extends Error {
   constructor(status, message, innerError) {
      super(message);

      this.status = status;
      this.message = message;


      if (innerError != null) {
         this.innerError = innerError;
         this.text = innerError.message;
      }
   }

   toJSON() {
      return {
         status: this.status,
         message: this.message,
         text: this.text
      };
   }
}

/*
 * Naturally, GET /parse?query=... means your search is a) URL-encoded, b) bounded by URI
 * size limitations. On the other hand, you can cache the parsed representation without
 * violating HTTP POST semantics.
 *
 * If submitting a query for parsing results in a backend state change (perhaps populating
 * a history collection/table?) it'd be better modeled as a POST.
 */ 
app.get("/parse", (req, res, next) => {
   if (req.query.query == null) {
      res.status(400).json(new RequestError(400, "Missing search query"));
      return next(false);
   }

   try {
      const parsed = Parser.parse(req.query.query);
      res.status(200).json(parsed);
   }
   catch (err) {
      res.status(400).json(new RequestError(400, "Failed to parse search query", err));
   }
});

app.listen(PORT, () => {
   console.log(`Listening on ${PORT}`);
});
