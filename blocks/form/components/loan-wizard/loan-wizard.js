import { WizardLayout } from '../wizard/wizard.js';

/**
 * Extends WizardLayout to wire authored form button fields as navigation buttons.
 * Buttons named with a "*Next" suffix trigger forward navigation + step validation.
 * Buttons named with a "*Prev" suffix trigger backward navigation.
 * These authored buttons appear in Rule Editor so Click events can invoke custom functions.
 *
 * The "Show Built-in Next/Back Buttons" property (showNavButtons) controls whether the
 * standard wizard Next/Back buttons are also rendered. Enable it if you do not want to
 * author explicit navigation buttons but still want the loan-wizard component type.
 */
class LoanWizardLayout extends WizardLayout {
  constructor() {
    super(false, false);
  }

  applyLayout(panel, showNavButtons) {
    this.includePrevBtn = !!showNavButtons;
    this.includeNextBtn = !!showNavButtons;
    super.applyLayout(panel);
    if (!showNavButtons) {
      panel.querySelector('.wizard-button-wrapper')?.remove();
    }
    this.wireNavButtons(panel);
  }

  wireNavButtons(panel) {
    this.getSteps(panel).forEach((step) => {
      const nextBtn = step.querySelector('button[name$="next" i]');
      const prevBtn = step.querySelector('button[name$="prev" i]');
      if (nextBtn) nextBtn.addEventListener('click', () => this.navigate(panel, true));
      if (prevBtn) prevBtn.addEventListener('click', () => this.navigate(panel, false));
    });
  }
}

const layout = new LoanWizardLayout();

export default function loanWizardLayout(panel, fd) {
  layout.applyLayout(panel, fd?.properties?.showNavButtons);
  return panel;
}
