import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import claudeRules from "./pre/claude-rules.ts";
import secrets from "./pre/secrets.ts";
import destructive from "./pre/destructive.ts";
import styleGate from "./pre/style-gate.ts";
import valonCommitChecks from "./pre/valon-commit-checks.ts";
import valonPeach from "./post/valon-peach.ts";

/** Registers the pre-tool-call guards in `pre/` and the post-edit hooks in `post/`. */
export default function (pi: ExtensionAPI) {
	claudeRules(pi);
	secrets(pi);
	destructive(pi);
	styleGate(pi);
	valonCommitChecks(pi);
	valonPeach(pi);
}
