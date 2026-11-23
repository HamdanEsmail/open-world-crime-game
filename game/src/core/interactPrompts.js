// One prompt at a time: many systems may want to show "F  Steal the Sirocco" or "E  Talk to Mina"
// in the same frame. Each offers its prompt with a priority; the best offer is shown, the rest wait.

/** Create game.prompts. Systems call offer() every frame they want a prompt; main.js calls flush(). */
export function createInteractPrompts(game) {
  let bestPriority = -1;
  let bestKey = '';
  let bestText = '';
  let shownKey = '';
  let shownText = '';

  return {
    /** Ask to show a key cap and a line of text this frame. Higher priority wins (missions 30, shops 20, vehicles 10). */
    offer(priority, keyLabel, text) {
      if (priority > bestPriority) {
        bestPriority = priority;
        bestKey = keyLabel;
        bestText = text;
      }
    },
    /** Show the winning offer of this frame on the HUD, or clear the prompt when there was none. */
    flush() {
      const hud = game.hud;
      if (hud && hud.setPrompt) {
        if (bestPriority >= 0) {
          if (bestKey !== shownKey || bestText !== shownText) hud.setPrompt(bestKey, bestText);
        } else if (shownText !== '') {
          hud.clearPrompt();
        }
      }
      shownKey = bestPriority >= 0 ? bestKey : '';
      shownText = bestPriority >= 0 ? bestText : '';
      bestPriority = -1;
    },
    get current() {
      return shownText;
    },
  };
}
