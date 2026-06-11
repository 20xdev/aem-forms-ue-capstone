import rangeDecorate from '../range/range.js';

function abbreviateInr(num) {
  if (num >= 1e7) return `${+(num / 1e7).toFixed(1)}Cr`;
  if (num >= 1e5) return `${Math.round(num / 1e5)}L`;
  if (num >= 1e3) return `${Math.round(num / 1e3)}K`;
  return `${num}`;
}

function formatNum(value, format) {
  const num = Number(value);
  if (format === 'inr') return num.toLocaleString('en-IN');
  return `${num}`;
}

function abbreviateLabel(value, format) {
  const num = Number(value);
  if (format === 'inr') return abbreviateInr(Math.round(num));
  return `${Math.round(num)}`;
}

// The base range.js sets --current-steps/--total-steps using step counts, which diverges
// from the actual thumb position when the value isn't on an exact step boundary.
// This overrides those vars with the true value ratio so fill always tracks the thumb.
function updateFill(input, wrapper) {
  const min = parseFloat(input.min) || 0;
  const max = parseFloat(input.max) || 100;
  const value = parseFloat(input.value) || min;
  const ratio = max > min ? (value - min) / (max - min) : 0;
  wrapper.style.setProperty('--total-steps', '1000');
  wrapper.style.setProperty('--current-steps', String(Math.round(ratio * 1000)));
}

function buildTicks(input, format, count) {
  const min = parseFloat(input.min) || 0;
  const max = parseFloat(input.max) || 100;
  const container = document.createElement('div');
  container.className = 'slider-ticks';
  container.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i += 1) {
    let value;
    if (i === 0) value = min;
    else if (i === count - 1) value = max;
    else value = min + ((max - min) / (count - 1)) * i;
    const span = document.createElement('span');
    span.className = 'slider-tick-label';
    if (i === 0) {
      span.style.left = '0';
    } else if (i === count - 1) {
      span.style.right = '0';
    } else {
      span.style.left = `${((value - min) / (max - min)) * 100}%`;
      span.style.transform = 'translateX(-50%)';
    }
    span.textContent = abbreviateLabel(value, format);
    container.appendChild(span);
  }
  return container;
}

/**
 * Enhanced range slider with formatted value display and abbreviated tick labels.
 * Configured via fd.properties:
 *   format    'number' | 'inr'  — numeric formatting and tick abbreviation (default: 'number')
 *   prefix    string            — prepended to value display, e.g. '₹'
 *   suffix    string            — appended to value display, e.g. ' months'
 *   tickCount number            — tick labels below track (default: 7)
 *   stepValue number            — slider step (passed through to base range)
 */
export default async function decorate(fieldDiv, fd) {
  const {
    format = 'number',
    prefix = '',
    suffix = '',
    tickCount = 7,
  } = fd?.properties ?? {};
  const count = Math.max(2, Number(tickCount) || 7);

  await rangeDecorate(fieldDiv, fd);

  const wrapper = fieldDiv.querySelector('.range-widget-wrapper');
  if (!wrapper) return fieldDiv;

  const input = wrapper.querySelector('input[type="range"]');
  wrapper.classList.add('slider-track');

  // Remove base elements we replace with richer alternatives
  wrapper.querySelector('.range-bubble')?.remove();
  wrapper.querySelector('.range-min')?.remove();
  wrapper.querySelector('.range-max')?.remove();

  // Value box: sits between field label and slider in the grid layout
  const valueBox = document.createElement('span');
  valueBox.className = 'slider-value';
  valueBox.textContent = `${prefix}${formatNum(input.value, format)}${suffix}`;
  fieldDiv.insertBefore(valueBox, wrapper);

  // Tick labels under the track
  let ticksEl = buildTicks(input, format, count);
  wrapper.appendChild(ticksEl);

  // Correct initial fill (base range.js may have set step-based vars already)
  updateFill(input, wrapper);

  let lastMax = input.max;
  input.addEventListener('input', () => {
    valueBox.textContent = `${prefix}${formatNum(input.value, format)}${suffix}`;
    // Override step-based CSS vars with true value ratio so fill tracks the thumb
    updateFill(input, wrapper);
    if (input.max !== lastMax) {
      lastMax = input.max;
      ticksEl.remove();
      ticksEl = buildTicks(input, format, count);
      wrapper.appendChild(ticksEl);
    }
  });

  fieldDiv.classList.add('field-slider');
  return fieldDiv;
}
