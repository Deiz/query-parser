run:
	NODE_PATH=. node index.js

unit:
	NODE_PATH=. node parse_test.js

.PHONY: run test
