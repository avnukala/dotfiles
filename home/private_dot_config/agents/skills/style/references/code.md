# Code

Rules for code in any language, including comments, docstrings, and tests. "Python specifics" applies to Python only. "TypeScript and React specifics" applies to TypeScript only.

Write the plain, direct version that does the task now, and nothing more.

## Core tenants

- Trust contracts that the repository owns.
- Keep the control flow flat. Return early.
- Prefer duplication over the wrong abstraction.
- Derive data. Do not store it.
- Keep side effects few and at the edges.
- Prefer readable code over fast code. Optimize only after a measurement.
- Keep comments rare and load-bearing.
- Use clear names. Use one name for one concept, everywhere.
- Spell out each word in a name. Do not drop vowels or cut words to save characters. Keep an acronym only when it is a standard term in the domain or the codebase.
- When a source such as a file spec, an external API, or a legacy schema uses short names, use full names in your code and schemas. Keep the source name in a comment or a mapping, not in the identifier.

## Scope of a change

- Make the smallest change that does the task. Do not touch code that the task does not need.
- Do not reformat lines that you did not change. Leave no hunks that change nothing.
- Follow the structure, formatter, linter, and checks that the repository already uses.
- Before you add to a class, function, module, fixture, or test helper, read its docstring, its comments, and the nearby docs. If any of them says DEPRECATED, do not add code to it. Follow the replacement that the note names. If no replacement is named, ask the user. Example: `LoanSetup` says "DEPRECATED Use LoanFixtures + LoanFixtureModifiers instead", so new tests use `LoanFixtures`.
- Do not add new tests that depend on deprecated setup or code. Fix the test with the replacement, or leave the deprecated code unchanged.
- Add or update the test for changed logic in the same change. Follow the repository test style. These rules apply to test code too.

## Workflow

1. Find the owned contract.
   - Find who writes the data, who validates it, and who calls this code.
   - If a schema, typed call, database constraint, or migration owns the shape, do not check it again. No `isinstance` on owned shapes.
   - Validate only at trust boundaries: user input, third-party responses, secrets, the filesystem, and database availability.
2. Build only what the task needs.
   - No options, parameters, or hooks "for later".
   - Add a dependency only when the task needs it, and never one that needs a different version of a package that the project uses. If a dependency serves one 15-line function, write the function.
3. Delete defensive code that hides bugs.
   - Keep failure handling only when it changes behavior.
   - Remove error handling and logging that do not help. Follow the repository guidance.
4. Abstract at the third instance.
   - Keep repeated code for 1 or 2 instances. For business logic, prefer plain boilerplate.
   - Write a helper only for a domain operation, an invariant, or many callers. Otherwise inline it. Put a needed helper near the flow that uses it.
   - If shared code grows a flag or branch per caller, copy it back into the callers and find the real shared part.
   - When you abstract, make the module deep: a small interface over much work.
5. Shape the data and state.
   - Replace arguments that travel together through several calls with one small typed object, such as a dataclass.
   - Make each write idempotent. Use a transaction when several rows in one database change together.
   - Favor immutable data and pure functions. Module-level constants are fine.
6. Lay it out compactly.
   - Put a signature on one line when it fits. Write each `from x import a, b, c` on one line when it fits; never a parenthesized list. Let the formatter break lines.
   - Use blank lines to mark logical steps in a long function.

## What to keep

- one exhaustive `match` or `switch` that shows every case
- validation at trust boundaries
- failure handling that changes behavior
- idempotent writes and transactions
- module-level constants
- existing docstrings
- deep modules with small interfaces

## What to remove

- nested conditionals and dispatch tables that do the job of one `match`
- checks that repeat a schema, type, or constraint
- stored data that you can compute from data you already have
- one-off helpers, pass-through layers, and interfaces with one implementation
- shared code with per-caller flags
- mutable global state
- classes that you create only to call one method
- loose parameters that always travel together
- commented-out code

## Comments and docstrings

- Make the code readable without comments. Write no inline comments by default.
- Comment only a fact that the code cannot show: an invariant, a hazard, a hidden constraint, or surprising behavior. Explain why, not what or how.
- Keep each comment to one line. Use a short block only when the reason needs more.
- Never narrate the flow, for example "Step 1: load the user".
- Add a docstring for public API and for logic that is not obvious. No long docstring for code that explains itself.
- Update comments and docstrings in the same change as the code.

## Python specifics

- Use a `Literal` type, not an `enum.Enum` subclass. Add a class of `Final` constants when call sites need names.
- Check that a `match` covers every case with `assert_never`.
- Make arguments keyword-only in public API functions with more than two arguments (not counting `self` or `ctx`), or with two arguments of the same type.
- Never use a mutable default. Default to `None`, or use `field(default_factory=...)` in a dataclass.
- Write a module-level function instead of a `@staticmethod`.

```python
Color = Literal["RED", "BLUE"]

class ColorValues:
    RED: Final = "RED"
    BLUE: Final = "BLUE"

def price(color: Color) -> int:
    match color:
        case "RED":
            return 1
        case "BLUE":
            return 2
        case _:
            assert_never(color)

def transfer(*, source_id: str, target_id: str, amount: Decimal) -> None: ...

def collect(items: list[int] | None = None) -> None:
    if items is None:
        items = []

@dataclass(frozen=True)
class Event:
    datetime_created: datetime = field(default_factory=datetime.now)
    items: list[int] = field(default_factory=list)
```

## TypeScript and React specifics

- Write a component as a `function` declaration with typed props. Do not type the component with `FC` or `React.FC`.
- Put the props in an `interface` named after the component, such as `BadgeProps`, above the component.
- Add `children` to the props only when the component renders them.
- If the repository `AGENTS.md` or convention says to use `FC`, follow the repository.

Before:

```tsx
export const Badge: React.FC<{ label: string }> = ({ label }) => <span>{label}</span>;
```

After:

```tsx
interface BadgeProps {
  label: string;
}

export function Badge({ label }: BadgeProps) {
  return <span>{label}</span>;
}
```

## Example pattern

Before:

```python
class PriceService:
    def get_price(self, order: Order) -> int:
        # Step 1: check the order
        if not isinstance(order, Order) or order.color is None:
            return 0
        try:
            return self._lookup(order.color)
        except Exception:
            logger.exception("price failed")
            return 0

    def _lookup(self, color: str) -> int:
        return {"RED": 1, "BLUE": 2}.get(color, 0)
```

After:

```python
def price(color: Color) -> int:
    match color:
        case "RED":
            return 1
        case "BLUE":
            return 2
        case _:
            assert_never(color)
```

The second version is not less safe. The type owns the shape, an unknown color fails the type check, and a real error stays loud.

## Review checklist

- Did any file or symbol that the diff touches say DEPRECATED? If yes, the diff must not add code to it. Move the change to the named replacement.
- What contract owns this shape, and did I check it again?
- Does the diff touch anything that the task does not need?
- What failures should be loud, and are they?
- What helpers survived, and does each have a domain reason or three callers?
- Is any stored value derivable?
- Does each comment state a fact that the code cannot show?
- Did the logic change come with its test?

Sources: Google "Small CLs" and Python Style Guide, Hyrum's Law, KISS, YAGNI, PEP 8, PEP 20, PEP 3102, the Rule of Three, Sandi Metz "The Wrong Abstraction", Ousterhout "A Philosophy of Software Design", Go proverbs.
