function parseRegionString(region) {
  const text = Array.isArray(region)
    ? region.filter(Boolean).join(' ')
    : String(region || '').trim();
  if (!text) return null;
  const parts = text.split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1) return { province: parts[0], city: parts[0] };
  return { province: parts[0], city: parts[1] };
}

function normalizeShipRegion(input) {
  if (!input || typeof input !== 'object') return null;
  const province = String(input.province || '').trim();
  const city = String(input.city || '').trim();
  if (!city) return null;
  return { province: province || city, city };
}

function formatShipFromLabel(shipRegion) {
  const region = normalizeShipRegion(shipRegion);
  if (!region) return '';
  const { province, city } = region;
  if (!province || province === city || city.includes(province.replace(/(省|市|自治区|壮族自治区|回族自治区|维吾尔自治区|特别行政区)$/, ''))) {
    return city;
  }
  return `${province} · ${city}`;
}

function formatShipFromField(shipRegion) {
  const region = normalizeShipRegion(shipRegion);
  if (!region) return null;
  return {
    province: region.province,
    city: region.city,
    label: formatShipFromLabel(region),
  };
}

module.exports = {
  parseRegionString,
  normalizeShipRegion,
  formatShipFromLabel,
  formatShipFromField,
};
