Parses Lucene-like queries (mostly). This is ultimately only an approximation of correctness; a true grammar would get much closer.

This project includes an HTTP API, with a single endpoint, `/parse?query=...`, usage is as follows:
```
curl 'localhost:8081/parse?query=foo%20bar'
{"$and":["foo","bar"]}

curl --get 'localhost:8081/parse' --data-urlencode 'query=(foo OR bar) AND (baz OR >300)'
{"$and":[{"$or":["foo","bar"]},{"$or":["baz",{"$gt":"300"}]}]}
```

Supports standard operators: >=, <=, >, <, =, !.

Terms can be prepended with an operator, e.g. `<400` or `!="foo"`, and can be grouped with parentheses, e.g. `(foo AND bar)`

The output of the parser is a JSON format, and a few examples are:
```json
// error OR info
{
    "$or": [
        "error",
        "info"
    ]
}

// foo OR bar AND baz
{
    "$or": [
        "foo",
        {
            "$and": [
                "bar",
                "baz"
            ]
        }
    ]
}

// !="foo"
{
    "$not": {
        "$eq": {
            "$quoted": "foo"
        }
    }
}
```
