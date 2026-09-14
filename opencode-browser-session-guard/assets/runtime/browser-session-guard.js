// OpenCode global plugin. The conversation identity comes from OpenCode itself.
// MCP processes may be shared by multiple conversations in the same project.
export const BrowserSessionGuard = async () => ({
  'tool.execute.before': async (input, output) => {
    if (!/^(playwright_|chrome[-_]devtools_)/.test(input.tool)) return;
    if (!input.sessionID) throw new Error('OpenCode did not supply a browser conversation ID.');
    output.args ||= {};
    output.args.__opencodeSessionId = input.sessionID;
  }
});
