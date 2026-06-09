// Game menu controller. The menu DOM lives in index.html — this module
// just wires up state + handlers.
//
// States:
//   no world loaded → "Continue" loads save (or is disabled), "New World" makes one
//   world loaded    → "Continue" becomes "Resume", "New World" still makes one

export function createMenu(handlers) {
  const root = document.getElementById('menu');
  const continueBtn = root.querySelector('[data-action=continue]');
  const newBtn = root.querySelector('[data-action=new]');
  const seedEl = root.querySelector('[data-role=seed]');
  const continueLabel = continueBtn.querySelector('.label');
  const continueHint = continueBtn.querySelector('.hint');

  let worldLoaded = false;
  let currentSeed = null;

  function render() {
    if (worldLoaded) {
      continueLabel.textContent = 'Resume';
      continueHint.textContent = 'Back to the world';
      continueBtn.disabled = false;
    } else {
      const save = handlers.peekSave();
      if (save) {
        continueLabel.textContent = 'Continue';
        continueHint.textContent = `World #${save.seed}`;
        continueBtn.disabled = false;
      } else {
        continueLabel.textContent = 'Continue';
        continueHint.textContent = 'No saved world yet';
        continueBtn.disabled = true;
      }
    }
    seedEl.textContent = currentSeed != null ? `World #${currentSeed}` : '';
  }

  continueBtn.addEventListener('click', () => {
    if (continueBtn.disabled) return;
    if (worldLoaded) handlers.onResume();
    else handlers.onContinue();
  });

  newBtn.addEventListener('click', () => {
    handlers.onNew();
  });

  function show() {
    root.classList.remove('hidden');
    document.body.classList.add('menu-open');
    render();
  }
  function hide() {
    root.classList.add('hidden');
    document.body.classList.remove('menu-open');
  }
  function toggle() {
    if (root.classList.contains('hidden')) show();
    else hide();
  }
  function setWorldLoaded(seed) {
    worldLoaded = true;
    currentSeed = seed;
    render();
  }

  return {
    show, hide, toggle, setWorldLoaded,
    isVisible: () => !root.classList.contains('hidden'),
  };
}
