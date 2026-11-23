// The cinematic frame for KHAMSIN's cutscenes: black bars slide in from the top and the bottom,
// the HUD fades back, and the subtitles settle into the lower bar like a film's.

/**
 * Build the bars in `root` (#cutscene-letterbox).
 * @returns {{set(on:boolean):void, isOn:boolean}}
 */
export function createCutsceneLetterbox(game, root) {
  root.textContent = '';
  root.classList.add('letterbox');
  const top = document.createElement('div');
  top.className = 'letterbox-bar letterbox-bar--top';
  const bottom = document.createElement('div');
  bottom.className = 'letterbox-bar letterbox-bar--bottom';
  root.append(top, bottom);
  const letterbox = { set, isOn: false };
  let hideTimer = 0;

  /** Slide the bars in (true) or out (false). */
  function set(on) {
    const next = Boolean(on);
    if (next === letterbox.isOn) return;
    letterbox.isOn = next;
    clearTimeout(hideTimer);
    if (game.hud && game.hud.setDimmed) game.hud.setDimmed(next);
    if (next) {
      root.hidden = false;
      void root.offsetWidth;
      root.classList.add('is-on');
    } else {
      root.classList.remove('is-on');
      hideTimer = setTimeout(() => {
        if (!letterbox.isOn) root.hidden = true;
      }, 700);
    }
  }

  root.hidden = true;
  return letterbox;
}
