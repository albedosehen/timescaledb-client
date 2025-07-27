LLM CONTRIBUTION RULES FOR THIS DENO LIBRARY
Use Deno-Only Tooling

All code, scripts, and tasks must use Deno’s built-in tools:
deno run, deno test, deno fmt, deno lint, deno task
No Node.js Artifacts

Do not add package.json, node_modules, or any Node-specific files unless explicitly requested.
Never require or import Node core modules (fs, path, etc).
Imports and Dependency Management

All external dependencies must be referenced via the import map in deno.json/deno.jsonc.

Bare specifiers (e.g., import { RecordId } from 'surrealdb') are preferred in code, with versions and sources managed centrally in the import map.

For internal modules, use relative imports.

Direct URL imports should be avoided except for rare cases (e.g., for quick experiments or when a dependency is not available via npm or jsr).

If a direct URL is used, pin the version explicitly.

Do not use versionless or unpinned URL imports.

Example:

// Good:
import { RecordId } from 'surrealdb' // maps to 'npm:surrealdb@1.3.2' in deno.json

// For internal files:
import { doSomething } from './utils/do-something.ts'
Native TypeScript

Write all source files in TypeScript (.ts), not JavaScript.
No transpilation or build steps—Deno runs TypeScript natively.
Standard convention in TypeScript:

camelCase for variables, functions, and file names:
doSomething.ts, someFunction
PascalCase for types, classes, and components:
MyComponent, SomeType
UPPER_CASE for constants:
Example:

// Good

/** Default timeout for requests */
export const DEFAULT_TIMEOUT = 3000;

/**

- Function to add two numbers
- @param a First number
- @param b Second number
- @returns Sum of a and b
  */
  const doSomething = (a: number, b: number): number => a + b;

/**

- Map over an array and double each value
  */
  const items = [1, 2, 3].map(x => x * 2);

/**

- Class representing a user
- @class MyClass
- @param name Name of the user
- @example
- ```typescript
  ```
- const user = new MyClass('Alice');
- ```
  ```

*/
export class MyClass {
constructor(private readonly name: string) {}

/**

- Get the name of the user
- @returns User's name
  */
  getName(): string {
  return this.name;
  }

/**

- Set the name of the user
- @param name New name for the user
  */
  setName(name: string): void {
  this.name = name;
  }

/**

- Create a new instance of MyClass
- @param name Name of the user
- @returns New instance of MyClass
  */
  static createInstance(name: string): MyClass {
  return new MyClass(name);
  }
  }

/* User type definition _/
type User = {
/_ Unique identifier for the user _/
id: string;
/_ Name of the user */
name: string;
};

/**

- Function to greet a user
- @param user User object
- @returns Greeting message
  */
  const myFunction = (user: User): string => {
  return `Hello, ${user.name}`;
  };

// Bad because it uses "Type" in the name when it is a type/interface by keyword already and no definition
type MyType = {
id: string;
value: number;
};

// Bad because it has no definition and uses slow-types
const myFunction = (user: User) => {
return { id: user.id, value: 42 };
};
Use Named Parameters in TypeScript (Object Destructuring)

Use object destructuring for function parameters to improve readability and maintainability.
This allows for better type inference and makes it easier to add or remove parameters without changing the function signature.
All exported or public functions that take more than two parameters must use a single object parameter (named parameters via object destructuring).
Example:

// Good
type MyOptions = {
foo: string;
bar?: number; // optional
baz?: boolean; // optional
};

function doSomething({ foo, bar = 42, baz = false }: MyOptions) {
// ...
}

// Usage
doSomething({ foo: 'hello' });

// Bad
function foo(a, b, c, d, e) { ... }
foo(1, 2, undefined, 4, false);
Project Structure & Files

Respect and update deno.json for config, not package.json.
Main entry should be mod.ts or as defined in deno.json.
Export types and functions explicitly.
Deno APIs Preferred

Use Deno’s standard library or built-in APIs for everything (file IO, HTTP, etc).
Only use third-party dependencies if there is no quality alternative in the Deno standard library.
Always favor smaller, focused dependencies.
Testing

All new code must include Deno unit tests in a *_test.ts file.
Use only Deno’s built-in assert module for tests.
No outside test runners.
Formatting & Linting

All code must pass deno fmt and deno lint with zero errors or warnings.
All code must adhere to the linting rules defined in deno.json.
All code should use single quotes for strings, except when using template literals.
All code should use 2 spaces for indentation.
All code should be free of unnecessary whitespace and blank lines.
All code should be free of trailing commas.
All code should use === and !== for exact comparisons.
All code should avoid using any type in TypeScript. Always use specific types or generics.
All code should use globalThis instead of window or document.
All code should use const for variables that are not reassigned, and let for those that are.
All code should use async/await for asynchronous operations instead of callbacks or promises.
All code should use for...of or forEach for iterating over arrays instead of for...in.
All code should use import statements instead of require.
All code should use export statements instead of module.exports.
All code must follow ESM conventions.
All code should use concurrency when appropriate, such as Promise.all and Promise.allSettled for parallel operations.
All code should use async functions for asynchronous operations.
All code should take advantage of Deno built-in features such as Top-Level Await (TLA) and Deno.env
Documentation

All public functions/types must have clear TSDoc comments.
Update or generate documentation if project uses a doc tool (e.g. deno doc).
No Breaking Changes Without Approval

Do not remove, rename, or change the behavior of any public exports without explicit approval.
Keep it Simple

Do not over-engineer. Keep code and dependencies minimal.
Avoid abstractions or patterns unless they are necessary and well-justified.
Versioning & Releases

Follow SemVer for all changes.
Use git tags
Bump the version in deno.json after merging features or fixes.
Bump the version and summarize the changes briefly in CHANGELOG.md
Never do the following
Never add Node-specific configs or code.
Never use dynamic imports from untrusted sources.
Never bloat the dependency tree.
Never leave unused code, dead code, or commented-out experiments.
Never attempt to maintain-backward compatibility
Never modify unrelated files
Never violate the linting rules in deno.json
Never use thirdparty dependencies, with exception to surrealdb
Never use verbose code comment
Never write convoluted code
Never introduce dead code
Never use Node.Js tooling (npm, npx, node, yarn, etc)
Never add package.json, node_modules, or any Node-specific files unless explicitly requested.
Never use require or import Node core modules (fs, path, etc).
Never over-engineer a solution
Never change the behavior of any public exports without explicit approval (remove, rename)
Never use window, document, or any browser-specific APIs in Deno code. (Use globalThis instead)
Never use named parameters for small, simple functions where the meaning is always obvious
Never use any type in TypeScript. Always use specific types or generics.
Never use var for variable declarations. Always use let or const.
Never use double-quotes for strings. Always use single quotes, except for template literals.
When unsure
When in unsure, ask for review or clarification before implementing.
Always use context7 for latest information, documentation, and examples for topics and libraries.
Always use describe/it patterns for tests.
Never use `Deno.test` directly. Instead, use the `testing` module's `assert` functions within `describe`/`it` blocks.
