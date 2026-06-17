export default async function decorate(fieldDiv) {
  const optionDivs = [...fieldDiv.querySelectorAll(':scope > div')];
  const inputs = optionDivs.map((d) => d.querySelector('input[type="radio"]')).filter(Boolean);
  const iconBase = `${window.hlx.codeBasePath}/blocks/form/components/bank-selector/icons`;

  optionDivs.forEach((d) => { d.style.display = 'none'; });

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
    });
  });

  fieldDiv.append(cardsWrap);
  return fieldDiv;
}
