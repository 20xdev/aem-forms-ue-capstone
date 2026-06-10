import { WizardLayout } from '../wizard/wizard.js';

/**
 * Extends WizardLayout to wire authored form button fields as navigation buttons.
 * This keeps navigation buttons in the form model so the Rule Editor can bind
 * Click events to them (e.g. to call custom API functions before navigating).
 *
 * Usage:
 *  - In Universal Editor, name any Next button with a name ending in "Next"
 *    (e.g. welcomeNext, otpNext). Name Back buttons ending in "Prev" (e.g. otpPrev).
 *  - Each button must have a unique Name per step for Rule Editor binding.
 *  - Validation of the current step + navigation is handled automatically by this component.
 *  - Falls back to standard wizard behavior if no matching buttons are found.
 */
class LoanWizardLayout extends WizardLayout {
  constructor() {
    super(false, false); // Skip built-in Next/Back buttons — authored buttons are used instead
  }

  applyLayout(panel) {
    const hasAuthoredNavButtons = !!panel.querySelector('button[name$="Next"], button[name$="Prev"]');

    if (hasAuthoredNavButtons) {
      super.applyLayout(panel);
      panel.querySelector('.wizard-button-wrapper')?.remove();
      this.wireNavButtons(panel);
    } else {
      // No authored nav buttons found — fall back to standard wizard behavior
      new WizardLayout().applyLayout(panel);
    }
  }

  wireNavButtons(panel) {
    this.getSteps(panel).forEach((step) => {
      const nextBtn = step.querySelector('button[name$="Next"]');
      const prevBtn = step.querySelector('button[name$="Prev"]');
      if (nextBtn) {
        nextBtn.addEventListener('click', () => this.navigate(panel, true));
      }
      if (prevBtn) {
        prevBtn.addEventListener('click', () => this.navigate(panel, false));
      }
    });
  }
}

const layout = new LoanWizardLayout();

export default function loanWizardLayout(panel) {
  layout.applyLayout(panel);
  return panel;
}
