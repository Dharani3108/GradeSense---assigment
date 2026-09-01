# Project rules

## Technology

- Use React with TypeScript in strict mode.
- Use Tailwind CSS for styling; avoid isolated inline style objects unless dynamic values make them necessary.
- Use React Hook Form and Zod for user-input validation.
- Prefer `lucide-react` for interface icons.

## Code structure

- Keep screen-level components in `src/components` and generic UI elements in `src/components/ui`.
- Put API transport in `src/lib`, endpoint-specific calls in `src/services`, and reusable async state in `src/hooks`.
- Define shared API and domain interfaces in `src/types`.
- Keep components focused, typed, accessible, and reusable.

## UI and accessibility

- Build mobile-first and test layouts at small and large viewports.
- Every input must have an associated visible label, useful validation feedback, and keyboard-accessible controls.
- Preserve visible focus styles and respect native HTML semantics before adding ARIA attributes.
- Use clear loading, disabled, empty, and error states for asynchronous actions.

## API and security

- Do not hard-code API hosts, secrets, tokens, or credentials; use environment variables for configuration.
- Send credentialed requests through the shared API client.
- Surface safe server error messages to users, but never log passwords or authentication tokens.
- Prefer httpOnly, secure cookies for browser sessions.

## Quality checks

- Run `npm run lint` and `npm run build` before submitting changes when dependencies are available.
- Avoid unrelated formatting churn and do not modify generated artifacts manually.
