Always use subagents, if it will speed up the execution of the work.

## Svelte and SvelteKit

This is a SvelteKit app using Svelte 5. Use the official Svelte MCP workflow for all Svelte work.

When asked about Svelte or SvelteKit topics, use the Svelte MCP documentation tools first:

1. `list-sections` - discover available documentation sections.
2. `get-documentation` - fetch every relevant documentation section before making decisions.
3. `svelte-autofixer` - validate Svelte code after edits and keep fixing until no issues or suggestions remain.

If MCP tools are not directly available, use the official CLI equivalents:

```bash
npx -y @sveltejs/mcp list-sections
npx -y @sveltejs/mcp get-documentation "<section1>,<section2>"
npx -y @sveltejs/mcp svelte-autofixer "<code_or_path>"
```

For `.svelte`, `.svelte.ts`, or `.svelte.js` files, proactively delegate to the `svelte-file-editor` subagent when available. That subagent must use the official Svelte skills `svelte-code-writer` and `svelte-core-bestpractices`.

Prefer modern Svelte 5 patterns: runes (`$state`, `$derived`, `$effect` only as an escape hatch), `$props`, keyed each blocks, snippets/render tags, `onclick` event attributes, CSS custom properties for component styling hooks, and `createContext` over untyped context APIs.
