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

function parseShipRegionFromAddresses(addresses = []) {
  const list = Array.isArray(addresses) ? addresses : [];
  const target = list.find((item) => item.isDefault) || list[0];
  if (!target) return null;
  return parseRegionString(target.region);
}

function normalizeCityName(city) {
  return String(city || '').replace(/市$/, '').trim();
}

function isSameCity(regionA, regionB) {
  const a = normalizeShipRegion(regionA);
  const b = normalizeShipRegion(regionB);
  if (!a || !b) return false;
  return normalizeCityName(a.city) === normalizeCityName(b.city);
}

function shippingDistanceHint(receiverRegion, shipFrom) {
  const from = normalizeShipRegion(shipFrom);
  if (!from) return '';
  const label = formatShipFromLabel(from);
  const receiver = parseRegionString(receiverRegion);
  if (!receiver || !receiver.city) {
    return `赠书方从${label}寄出，运费收件时向快递员支付`;
  }
  if (isSameCity(receiver, from)) {
    return '与您同城寄递，到付运费通常较低；实际运费以快递员收费为准';
  }
  return '跨省寄递，到付运费通常高于同城；实际运费以快递员收费为准';
}

module.exports = {
  parseRegionString,
  normalizeShipRegion,
  formatShipFromLabel,
  parseShipRegionFromAddresses,
  shippingDistanceHint,
};
