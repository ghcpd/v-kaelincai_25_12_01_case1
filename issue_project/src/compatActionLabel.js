function toDatasetKey(attribute) {
  if (!attribute.startsWith('data-')) {
    return attribute;
  }

  return attribute
    .slice(5)
    .split('-')
    .map((chunk, index) => (index === 0 ? chunk : chunk.charAt(0).toUpperCase() + chunk.slice(1)))
    .join('');
}

function getActionLabel(event, attribute = 'data-action') {
  if (!event) {
    throw new TypeError('An event-like object is required');
  }

  const target = event.target || event.currentTarget || null; // BUG: does not consider legacy srcElement

  if (!target) {
    return '';
  }

  if (typeof target.getAttribute === 'function') {
    const value = target.getAttribute(attribute);
    return typeof value === 'string' ? value : '';
  }

  if (target.dataset && attribute.startsWith('data-')) {
    const datasetKey = toDatasetKey(attribute);
    return target.dataset[datasetKey] || '';
  }

  if (attribute in target) {
    const value = target[attribute];
    return typeof value === 'string' ? value : '';
  }

  return '';
}

module.exports = { getActionLabel };
