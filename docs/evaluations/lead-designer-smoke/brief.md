Request: you want a small library and command-line tool, for Node.js 22 with no dependencies, to keep your reading list. You can add a book, mark a book as read, and list the books you have not read yet. You want it designed well before it is built.

What you know if asked:
- The list lives in `~/.reading-list.json`.
- The output is plain text, one book per line.
- Tests use `node:test`.
- A book has a title and an author; nothing else.

How you behave:
- Confirm the agent's understanding when it matches the above.
- Approve the approach the agent recommends, and the design sections as presented.
Stop condition: the agent says the spec is written and committed. Then reply DONE, which counts as your approval of the spec.
