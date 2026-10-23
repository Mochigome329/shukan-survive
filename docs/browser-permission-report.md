# Browser site permission mismatch — Windows desktop

## Expected
The built-in browser can open http://127.0.0.1:4173/uchikiri.html after the user grants access.

## Observed
- The user explicitly authorized browser testing in chat.
- The supplied Settings screenshot shows default Web browsing = Always allow, and a specific http://127.0.0.1:4173 rule = Always allow.
- Navigation is denied before the local page loads, with: "A saved user permission setting blocks this action."
- A full desktop app restart did not resolve the mismatch.
- The browser plugin changed from 26.901.41600 to 26.901.51231 during troubleshooting; the latter also returned the same denial. These are plugin versions, not the app version.
- The existing hosted game could be inspected and clicked successfully, including target selection at a 390 × 844 viewport. The failure is therefore not a total browser connection failure.
- Temporary HTTP servers were bound only to 127.0.0.1 and served only the game's dist directory. They were stopped after denied attempts.

## Questions for support
Why does the access evaluator return a saved deny while the visible site rule and default both show Always allow? Is there an additional scope, stale grant, origin normalization issue, or known permission persistence defect?

## Additional diagnostic performed
The user changed both the default and affected site's Web browsing setting to Requires approval (the UI required changing the default as well). One normal navigation was requested afterward. It still immediately returned "A saved user permission setting blocks this action" instead of an approval request. The temporary server and test tab were then closed. Re-saving the permission as Requires approval did not resolve the issue. Do not use alternate origins or browser mechanisms to circumvent the denial.

Official documentation: https://learn.chatgpt.com/docs/browser?surface=app and https://learn.chatgpt.com/docs/reference/troubleshooting

This report contains no credentials, cookies, account identifiers, or full session transcript. It has not been sent externally.
