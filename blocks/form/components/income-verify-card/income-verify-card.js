export default async function decorate(fieldDiv, fd) {
  const optionDivs = [...fieldDiv.querySelectorAll(':scope > div')];
  const inputs = optionDivs.map((d) => d.querySelector('input[type="radio"]')).filter(Boolean);

  const props = fd?.properties || {};
  const rawDescriptions = props.optionDescriptions || [];
  const descriptions = Array.isArray(rawDescriptions) ? rawDescriptions : [rawDescriptions];
  const badgeOption = props.badgeOption || '';
  const badgeText = props.badgeText || '';

  const descMap = {};
  (fd?.enum || []).forEach((val, i) => { descMap[val] = descriptions[i] || ''; });

  optionDivs.forEach((d) => { d.style.display = 'none'; });

  const cardsWrap = document.createElement('div');
  cardsWrap.className = 'verify-cards';

  inputs.forEach((input) => {
    const labelText = input.nextElementSibling?.textContent?.trim() || input.value;

    const card = document.createElement('label');
    card.className = `verify-card verify-${input.value}`;
    card.htmlFor = input.id;
    if (input.checked) card.classList.add('selected');

    const radioIndicator = document.createElement('span');
    radioIndicator.className = 'verify-radio';
    radioIndicator.setAttribute('aria-hidden', 'true');

    const content = document.createElement('span');
    content.className = 'verify-content';

    const title = document.createElement('span');
    title.className = 'verify-title';
    title.textContent = labelText;

    const desc = document.createElement('span');
    desc.className = 'verify-desc';
    desc.textContent = descMap[input.value] || '';

    content.append(title, desc);
    card.append(radioIndicator, content);

    if (badgeText && input.value === badgeOption) {
      const badge = document.createElement('span');
      badge.className = 'verify-badge';
      badge.textContent = badgeText;
      card.append(badge);
    }

    cardsWrap.append(card);

    input.addEventListener('change', () => {
      cardsWrap.querySelectorAll('.verify-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
    });
  });

  fieldDiv.append(cardsWrap);
  return fieldDiv;
}
