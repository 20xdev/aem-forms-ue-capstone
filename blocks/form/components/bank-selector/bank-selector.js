export default async function decorate(fieldDiv) {
  const optionDivs = [...fieldDiv.querySelectorAll(':scope > div')];
  const inputs = optionDivs.map((d) => d.querySelector('input[type="radio"]')).filter(Boolean);
  const iconBase = `${window.hlx.codeBasePath}/blocks/form/components/bank-selector/icons`;

  optionDivs.forEach((d) => { d.style.display = 'none'; });

  // Find the sibling "other bank" field — the next field-wrapper after this one
  const formWrapper = fieldDiv.closest('.form-wrapper, form, [data-component]');
  const getOtherField = () => (formWrapper
    ? formWrapper.querySelector('[data-component="other_bank_name"], [name="other_bank_name"]')
      || fieldDiv.parentElement?.nextElementSibling?.querySelector('select, input[type="text"]')
    : null);

  const toggleOtherField = (show) => {
    const other = getOtherField();
    if (!other) return;
    const wrapper = other.closest('.field-wrapper') || other.parentElement;
    if (wrapper) wrapper.style.display = show ? '' : 'none';
  };

  const cardsWrap = document.createElement('div');
  cardsWrap.className = 'bank-selector-cards';

  inputs.forEach((input) => {
    const labelText = input.nextElementSibling?.textContent?.trim() || input.value;

    const card = document.createElement('label');
    card.className = `bank-card bank-${input.value}`;
    card.htmlFor = input.id;
    if (input.checked) card.classList.add('selected');

    const logo = document.createElement('span');
    logo.className = 'bank-logo';
    logo.setAttribute('aria-hidden', 'true');

    const img = document.createElement('img');
    img.src = `${iconBase}/${input.value}.svg`;
    img.alt = '';
    logo.append(img);

    const name = document.createElement('span');
    name.className = 'bank-name';
    name.textContent = labelText;

    card.append(logo, name);
    cardsWrap.append(card);

    input.addEventListener('change', () => {
      cardsWrap.querySelectorAll('.bank-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      toggleOtherField(input.value === 'other');
    });
  });

  fieldDiv.append(cardsWrap);

  // Set initial visibility based on current value
  const checkedInput = inputs.find((i) => i.checked);
  toggleOtherField(checkedInput?.value === 'other');

  return fieldDiv;
}
