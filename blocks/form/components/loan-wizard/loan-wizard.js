import { WizardLayout } from '../wizard/wizard.js';

/**
 * Extends WizardLayout to wire authored form button fields as navigation buttons.
 * Buttons named with a "*Next" suffix trigger forward navigation + step validation.
 * Buttons named with a "*Prev" suffix trigger backward navigation.
 * These authored buttons appear in Rule Editor so Click events can invoke custom functions.
 *
 * Navigation flow for Next buttons:
 *  1. Capture-phase listener validates the current step first.
 *  2. If invalid: stopImmediatePropagation() — Rule Editor never fires, no API call.
 *  3. If valid: button disabled, then event propagates to Rule Editor's bubble-phase listener.
 *  4. Custom function runs, calls API, dispatches loan-wizard:proceed or loan-wizard:cancel.
 *  5. proceed → navigate forward; cancel → re-enable button, show error in panel.
 */
class LoanWizardLayout extends WizardLayout {
  constructor() {
    super(false, false);
  }

  applyLayout(panel, showNavButtons, showStepMenu) {
    this.includePrevBtn = !!showNavButtons;
    this.includeNextBtn = !!showNavButtons;
    super.applyLayout(panel);
    if (!showNavButtons) {
      panel.querySelector('.wizard-button-wrapper')?.remove();
    }
    if (!showStepMenu) {
      panel.classList.add('no-step-menu');
    }
    this.wireNavButtons(panel);
    this.wireBackEvent(panel);
    this.wireGotoEvent(panel);
  }

  wireBackEvent(panel) {
    // Remove stale listener from previous render to avoid duplicate navigation calls.
    if (this.backHandler) {
      document.removeEventListener('loan-wizard:back', this.backHandler);
    }
    this.backHandler = () => {
      if (document.documentElement.classList.contains('adobe-ue-edit')) return;
      this.navigate(panel, false);
    };
    document.addEventListener('loan-wizard:back', this.backHandler);
  }

  jumpToStep(panel, stepIndex) {
    const steps = this.getSteps(panel);
    const targetStep = steps[stepIndex];
    if (!targetStep) return;
    const current = panel.querySelector('.current-wizard-step');
    if (current === targetStep) return;
    current?.classList.remove('current-wizard-step');
    targetStep.classList.add('current-wizard-step');
    panel.querySelector('.wizard-menu-active-item')?.classList.remove('wizard-menu-active-item');
    panel.querySelector(`li[data-index="${targetStep.dataset.index}"]`)?.classList.add('wizard-menu-active-item');
  }

  wireGotoEvent(panel) {
    if (this.gotoHandler) {
      document.removeEventListener('loan-wizard:goto', this.gotoHandler);
    }
    this.gotoHandler = (e) => {
      if (document.documentElement.classList.contains('adobe-ue-edit')) return;
      this.jumpToStep(panel, e.detail?.stepIndex ?? 0);
    };
    document.addEventListener('loan-wizard:goto', this.gotoHandler);
  }

  // eslint-disable-next-line class-methods-use-this
  showStepError(step, message) {
    let errorEl = step.querySelector('.wizard-step-error');
    if (!errorEl) {
      errorEl = document.createElement('p');
      errorEl.className = 'wizard-step-error';
      step.append(errorEl);
    }
    errorEl.textContent = message || '';
    errorEl.hidden = !message;
  }

  wireNavButtons(panel) {
    this.getSteps(panel).forEach((step) => {
      const nextBtn = step.querySelector('button[name$="next" i]');
      const prevBtn = step.querySelector('button[name$="prev" i]');

      if (nextBtn) {
        // Capture phase: runs before the Rule Editor's bubble-phase click listener.
        // Validation failure stops propagation so the bound custom function never executes.
        // Skipped in UE edit mode so authoring clicks are not intercepted.
        nextBtn.addEventListener('click', (event) => {
          if (document.documentElement.classList.contains('adobe-ue-edit')) return;
          const currentStep = panel.querySelector('.current-wizard-step');
          if (!this.validateContainer(currentStep)) {
            event.stopImmediatePropagation();
            return;
          }

          nextBtn.disabled = true;
          this.showStepError(currentStep, '');

          let onCancel;
          const onProceed = () => {
            nextBtn.disabled = false;
            document.removeEventListener('loan-wizard:cancel', onCancel);
            this.navigate(panel, true);
          };
          onCancel = (e) => {
            nextBtn.disabled = false;
            document.removeEventListener('loan-wizard:proceed', onProceed);
            this.showStepError(currentStep, e.detail?.error || 'An error occurred. Please try again.');
          };

          document.addEventListener('loan-wizard:proceed', onProceed, { once: true });
          document.addEventListener('loan-wizard:cancel', onCancel, { once: true });
        }, true);
      }

      if (prevBtn) {
        prevBtn.addEventListener('click', () => this.navigate(panel, false));
      }
    });
  }
}

const layout = new LoanWizardLayout();

export default function loanWizardLayout(panel, fd) {
  const { showNavButtons, showStepMenu = true } = fd?.properties ?? {};
  layout.applyLayout(panel, showNavButtons, showStepMenu);
  return panel;
}
