const API = {
  geocoding: 'https://geocoding-api.open-meteo.com/v1/search',
  weather: 'https://api.open-meteo.com/v1/forecast',
  // Cleveland: uma request traz obras completas, sem WAF. Met: fallback
  // (search + 1 request por obra, e o WAF Incapsula bloqueia rajadas).
  // O Art Institute bloqueia hotlink de imagem via Cloudflare, por isso saiu.
  cleveland: 'https://openaccess-api.clevelandart.org/api/artworks/',
  artworkSearch: 'https://collectionapi.metmuseum.org/public/collection/v1/search',
  artworkObject: 'https://collectionapi.metmuseum.org/public/collection/v1/objects',
};

// Departamento "European Paintings" do Met: só pintura, nada de cerâmica.
const MET_DEPARTMENT_PAINTINGS = 11;
const RECENT_KEY = 'galeria-do-clima:recent';
const RECENT_LIMIT = 3;

const WEATHER_DESCRIPTIONS = {
  0: 'Céu limpo',
  1: 'Principalmente limpo',
  2: 'Parcialmente nublado',
  3: 'Nublado',
  45: 'Neblina',
  48: 'Neblina com geada',
  51: 'Garoa fraca',
  53: 'Garoa moderada',
  55: 'Garoa intensa',
  56: 'Garoa congelante fraca',
  57: 'Garoa congelante intensa',
  61: 'Chuva fraca',
  63: 'Chuva moderada',
  65: 'Chuva intensa',
  66: 'Chuva congelante fraca',
  67: 'Chuva congelante intensa',
  71: 'Neve fraca',
  73: 'Neve moderada',
  75: 'Neve intensa',
  77: 'Grãos de neve',
  80: 'Pancadas de chuva fracas',
  81: 'Pancadas de chuva moderadas',
  82: 'Pancadas de chuva violentas',
  85: 'Pancadas de neve fracas',
  86: 'Pancadas de neve intensas',
  95: 'Trovoada',
  96: 'Trovoada com granizo fraco',
  99: 'Trovoada com granizo intenso',
};

function getWeatherDescription(weatherCode) {
  return WEATHER_DESCRIPTIONS[weatherCode] || 'Condição desconhecida';
}

function getWeatherTheme({ weatherCode, isDay }) {
  if ([95, 96, 99].includes(weatherCode)) return 'storm';
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) return 'snow';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) {
    return 'rain';
  }
  if ([45, 48].includes(weatherCode)) return 'fog';
  if (!isDay) return 'night';
  if ([2, 3].includes(weatherCode)) return 'cloudy';
  return 'clear';
}

function getArtKeywords(theme) {
  const keywords = {
    clear: ['sunlight', 'summer landscape', 'beach', 'garden', 'harvest'],
    cloudy: ['clouds', 'cloudy sky', 'overcast', 'sky study', 'haystacks'],
    fog: ['fog', 'mist', 'haze', 'morning harbor', 'twilight'],
    rain: ['rain', 'rainstorm', 'umbrella', 'wet street', 'storm at sea'],
    snow: ['snow', 'winter landscape', 'skating', 'ice', 'blizzard'],
    storm: ['storm', 'thunderstorm', 'shipwreck', 'lightning', 'tempest'],
    night: ['night', 'moonlight', 'nocturne', 'starry', 'evening'],
  };

  return keywords[theme] || keywords.clear;
}

// Tags do Met que confirmam o tema; usadas para ranquear os candidatos.
const THEME_TAGS = {
  clear: ['Sun', 'Summer', 'Beaches', 'Gardens', 'Harvesting', 'Fields', 'Landscapes', 'Picnics', 'Sunlight'],
  cloudy: ['Clouds', 'Skies', 'Landscapes', 'Seascapes', 'Windmills', 'Fields', 'Haystacks'],
  fog: ['Fog', 'Mist', 'Harbors', 'Twilight', 'Landscapes', 'Rivers', 'Bridges', 'Boats'],
  rain: ['Rain', 'Storms', 'Umbrellas', 'Rivers', 'Streets', 'Seascapes', 'Boats', 'Rainbows'],
  snow: ['Snow', 'Winter', 'Ice', 'Skating', 'Sleds', 'Landscapes'],
  storm: ['Storms', 'Lightning', 'Shipwrecks', 'Waves', 'Seascapes', 'Ships', 'Clouds'],
  night: ['Night', 'Moon', 'Stars', 'Nocturnes', 'Lamps', 'Candles', 'Fireworks', 'Cityscapes'],
};

const THEME_TITLE = {
  clear: /sun|summer|beach|garden|harvest|meadow|noon/i,
  cloudy: /cloud|sky|overcast|haystack|windmill/i,
  fog: /fog|mist|haze|twilight|dusk|dawn/i,
  rain: /rain|umbrella|wet|shower|flood|storm/i,
  snow: /snow|winter|ice|skat|sled|frost/i,
  storm: /storm|tempest|lightning|thunder|shipwreck|gale|squall/i,
  night: /night|moon|nocturne|star|evening|lantern|lamplight/i,
};

const SCENE_TAGS = ['Landscapes', 'Seascapes', 'Cityscapes', 'Skies', 'Gardens', 'Rivers', 'Mountains', 'Trees', 'Boats'];
const RELIGIOUS_TAGS = ['Christ', 'Saints', 'Virgin Mary', 'Madonna', 'Angels', 'Crucifixion', 'Jesus', 'Apostles', 'Annunciation', 'Nativity', 'Adoration', 'Bible', 'Holy Family', 'Prophets', 'Martyrs', 'Devils'];
const RELIGIOUS_TITLE = /saint|st\.|madonna|christ|virgin|crucifix|annunciation|adoration|holy|apostle|nativity|resurrection|martyr|magi|pietà|lamentation/i;

// Pontua uma obra do Met para um tema: tags e título que confirmam o tema
// somam; religioso e retrato tiram. Serve para escolher entre candidatos.
function scoreArtwork(artwork, theme) {
  const tags = (artwork.tags || []).map((tag) => (typeof tag === 'string' ? tag : tag.term));
  const title = artwork.title || '';
  let score = 0;

  for (const tag of tags) {
    if ((THEME_TAGS[theme] || []).includes(tag)) score += 3;
    else if (SCENE_TAGS.includes(tag)) score += 1;
    if (RELIGIOUS_TAGS.includes(tag)) score -= 4;
    if (tag === 'Portraits') score -= 2;
  }
  const titleRegex = THEME_TITLE[theme] || THEME_TITLE.clear;
  if (titleRegex.test(title)) score += 2;
  if (RELIGIOUS_TITLE.test(title)) score -= 4;
  if (artwork.text) {
    if (titleRegex.test(artwork.text)) score += 1;
    if (RELIGIOUS_TITLE.test(artwork.text)) score -= 2;
  }
  if (artwork.classification && !/painting/i.test(artwork.classification)) score -= 1;

  return score;
}

// Forma comum para obras de qualquer museu.
function normalizeCleveland(item) {
  const creator = item.creators?.[0]?.description || '';
  return {
    id: `cma-${item.id}`,
    title: item.title || '',
    artist: creator.replace(/\s*\(.*$/, '') || 'Artista não informado',
    artistDetail: creator,
    date: item.creation_date || '',
    url: item.url || `https://www.clevelandart.org/art/${item.accession_number || ''}`,
    image: item.images?.web?.url || '',
    tags: [],
    text: [item.description, item.tombstone, item.wall_description].filter(Boolean).join(' '),
    classification: item.type || '',
    source: 'Cleveland Museum of Art',
  };
}

function normalizeMet(item) {
  return {
    id: `met-${item.objectID}`,
    title: item.title || '',
    artist: item.artistDisplayName || 'Artista não informado',
    artistDetail: item.artistDisplayBio || '',
    date: item.objectDate || '',
    url: item.objectURL || `https://www.metmuseum.org/art/collection/search/${item.objectID}`,
    image: item.primaryImageSmall || item.primaryImage || '',
    tags: (item.tags || []).map((tag) => tag.term),
    text: '',
    classification: item.classification || '',
    source: 'The Met',
  };
}

function formatTemperature(value) {
  return `${Math.round(Number(value))} °C`;
}

function formatNumber(value, decimals = 0) {
  return Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`A API retornou o status ${response.status}.`);
  }
  return response.json();
}

async function searchCities(cityName, count = 5) {
  const params = new URLSearchParams({
    name: cityName.trim(),
    count: String(count),
    language: 'pt',
    format: 'json',
  });
  const payload = await fetchJson(`${API.geocoding}?${params}`);
  return payload.results || [];
}

async function findCity(cityName) {
  const results = await searchCities(cityName, 1);

  if (!results.length) {
    throw new Error('Cidade não encontrada. Confira o nome e tente novamente.');
  }

  return results[0];
}

function formatCityPlace(city) {
  return [city.admin1, city.country].filter(Boolean).join(', ');
}

async function getWeather(city) {
  const params = new URLSearchParams({
    latitude: city.latitude,
    longitude: city.longitude,
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,snowfall,weather_code,cloud_cover,wind_speed_10m,is_day',
    daily: 'sunrise,sunset',
    forecast_days: '2',
    timezone: 'auto',
  });
  return fetchJson(`${API.weather}?${params}`);
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const SEEN_KEY = 'galeria-do-clima:seen';
const SEEN_LIMIT = 30;
const POOL_SIZE = 120;
const SAMPLE_SIZE = 6;
const GOOD_SCORE = 3;
const POOL_KEY = 'galeria-do-clima:pool:';
const POOL_TTL = 24 * 60 * 60 * 1000;

// O pool de IDs por palavra-chave muda pouco; guardar por um dia poupa a API.
async function searchPool(keyword) {
  const key = `${POOL_KEY}${keyword}`;
  try {
    const cached = JSON.parse(localStorage.getItem(key) || 'null');
    if (cached && Date.now() - cached.at < POOL_TTL && Array.isArray(cached.ids)) return cached.ids;
  } catch {
    // cache inválido, segue para a rede
  }

  const params = new URLSearchParams({ q: keyword, hasImages: 'true', medium: 'Paintings' });
  const payload = await fetchJson(`${API.artworkSearch}?${params}`).catch(() => null);
  const ids = (payload?.objectIDs || []).slice(0, POOL_SIZE);
  try {
    if (ids.length) localStorage.setItem(key, JSON.stringify({ at: Date.now(), ids }));
  } catch {
    // sem armazenamento, sem cache
  }
  return ids;
}

function readSeen() {
  try {
    const list = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function rememberSeen(id) {
  try {
    const list = [id, ...readSeen().filter((item) => item !== id)].slice(0, SEEN_LIMIT);
    localStorage.setItem(SEEN_KEY, JSON.stringify(list));
  } catch {
    // sem armazenamento, sem memória
  }
}

const CLEVELAND_FIELDS = 'id,title,creators,creation_date,url,images,type,description,tombstone,wall_description,accession_number';
const MIN_CANDIDATES = 6;

async function searchCleveland(keyword) {
  const params = new URLSearchParams({
    q: keyword,
    type: 'Painting',
    has_image: '1',
    limit: '40',
    fields: CLEVELAND_FIELDS,
  });
  const payload = await fetchJson(`${API.cleveland}?${params}`).catch(() => null);
  return (payload?.data || []).map(normalizeCleveland);
}

async function searchMet(keyword, skip) {
  const pool = (await searchPool(keyword)).filter((id) => !skip.has(`met-${id}`));
  const ids = shuffle(pool).slice(0, SAMPLE_SIZE);
  const objects = await Promise.all(
    ids.map((id) => fetchJson(`${API.artworkObject}/${id}`).catch(() => null)),
  );
  return objects
    .filter((item) => item && item.primaryImageSmall && item.isPublicDomain)
    .map(normalizeMet);
}

function pickBest(candidates) {
  const ranked = [...candidates.values()].sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;
  // Entre os melhores empatados, sorteia, para não repetir a mesma obra.
  const top = ranked.filter((entry) => entry.score >= ranked[0].score - 1);
  return top[Math.floor(Math.random() * top.length)];
}

async function findArtwork(keywords, theme) {
  const seen = new Set(readSeen());
  const candidates = new Map();

  const collect = (items) => {
    for (const item of items) {
      if (!item.image || seen.has(item.id) || candidates.has(item.id)) continue;
      candidates.set(item.id, { item, score: scoreArtwork(item, theme) });
    }
  };

  for (const keyword of keywords) {
    collect(await searchCleveland(keyword));
    const best = pickBest(candidates);
    if (best && best.score >= GOOD_SCORE && candidates.size >= MIN_CANDIDATES) break;
  }

  // Poucas opções boas? Tenta o Met com a primeira palavra-chave.
  const bestSoFar = pickBest(candidates);
  if (!bestSoFar || bestSoFar.score < GOOD_SCORE) {
    collect(await searchMet(keywords[0], new Set([...seen, ...candidates.keys()])).catch(() => []));
  }

  const chosen = pickBest(candidates);
  if (!chosen) throw new Error('Não encontramos uma obra compatível com este clima.');
  rememberSeen(chosen.item.id);
  return chosen.item;
}

// ---------- sol e hora local ----------

function minutesOf(isoLocal) {
  const [, time = '00:00'] = String(isoLocal).split('T');
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

// Progresso 0..1 do sol no arco do dia (ou da lua no arco da noite).
function getSunProgress(weather) {
  const current = weather.current;
  const daily = weather.daily;
  if (!daily?.sunrise?.length || !daily?.sunset?.length) return null;

  const now = minutesOf(current.time);
  const sunrise = minutesOf(daily.sunrise[0]);
  const sunset = minutesOf(daily.sunset[0]);
  const isDay = Boolean(current.is_day);

  if (isDay) {
    const span = Math.max(1, sunset - sunrise);
    return { isDay, progress: (now - sunrise) / span };
  }

  const nextSunrise = minutesOf(daily.sunrise[1] || daily.sunrise[0]) + 24 * 60;
  const nightStart = now < sunrise ? sunset - 24 * 60 : sunset;
  const nightEnd = now < sunrise ? sunrise : nextSunrise;
  const span = Math.max(1, nightEnd - nightStart);
  return { isDay, progress: (now - nightStart) / span };
}

// ---------- paleta da obra ----------

function toHex({ r, g, b }) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

// Cores dominantes da imagem (precisa de CORS na imagem). Retorna null se não der.
function extractPalette(image) {
  try {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    const bins = new Map();
    for (let i = 0; i < data.length; i += 4) {
      const key = `${data[i] >> 5},${data[i + 1] >> 5},${data[i + 2] >> 5}`;
      const bin = bins.get(key) || { r: 0, g: 0, b: 0, n: 0 };
      bin.r += data[i];
      bin.g += data[i + 1];
      bin.b += data[i + 2];
      bin.n += 1;
      bins.set(key, bin);
    }

    const total = size * size;
    const colors = [...bins.values()]
      .filter((bin) => bin.n / total > 0.015)
      .map((bin) => {
        const r = bin.r / bin.n;
        const g = bin.g / bin.n;
        const b = bin.b / bin.n;
        return { r, g, b, n: bin.n, lum: 0.2126 * r + 0.7152 * g + 0.0722 * b };
      })
      .sort((a, b) => b.n - a.n)
      .slice(0, 6);

    if (colors.length < 2) return null;
    const byLum = [...colors].sort((a, b) => a.lum - b.lum);
    return { dark: toHex(byLum[0]), light: toHex(byLum[byLum.length - 1]) };
  } catch {
    return null;
  }
}

// O CDN do Met só manda CORS em algumas variantes/respostas; a imagem visível
// carrega sem CORS (sempre funciona) e uma cópia menor tenta com CORS só para
// amostrar cores. Falhou? Sem tinta, sem erro.
function samplePalette(url) {
  // Só o CDN do Met responde com CORS; nos outros a tentativa só geraria erro no console.
  if (!url.includes('images.metmuseum.org')) return Promise.resolve(null);
  return new Promise((resolve) => {
    const probe = new Image();
    probe.crossOrigin = 'anonymous';
    probe.onload = () => resolve(extractPalette(probe));
    probe.onerror = () => resolve(null);
    probe.src = url.includes('/web-large/') ? url.replace('/web-large/', '/mobile-large/') : url;
  });
}

// ---------- estado da última busca ----------

const lastShown = { theme: 'rest', sun: null, wind: 0 };

function setStatus(message, type = 'info') {
  const status = document.querySelector('#status');
  status.textContent = message;
  status.dataset.type = type;
}

function renderWeather(city, weather) {
  const current = weather.current;
  const theme = getWeatherTheme({
    weatherCode: current.weather_code,
    isDay: current.is_day,
  });

  const sun = getSunProgress(weather);
  lastShown.theme = theme;
  lastShown.sun = sun;
  lastShown.wind = Number(current.wind_speed_10m) || 0;

  document.body.dataset.theme = theme;
  document.body.classList.add('has-results');
  window.gallerySky?.setTheme(theme, { sun });
  window.gallerySky?.setWind(lastShown.wind);
  window.gallerySound?.setTheme(theme);
  setWindOnFrame(lastShown.wind);
  document.title = `${formatTemperature(current.temperature_2m)} em ${city.name}`;
  setFavicon(theme);

  document.querySelector('#cityName').textContent = `${city.name}, ${city.country}`;
  document.querySelector('#localTime').textContent = `Horário local: ${current.time.replace('T', ' ')}`;
  document.querySelector('#weatherDescription').textContent = getWeatherDescription(current.weather_code);
  animateTemperature(Math.round(Number(current.temperature_2m)));
  document.querySelector('#feelsLike').textContent = `${formatTemperature(current.apparent_temperature)} (sensação)`;
  document.querySelector('#humidity').textContent = `${formatNumber(current.relative_humidity_2m)}%`;
  document.querySelector('#precipitation').textContent = `${formatNumber(current.precipitation, 1)} mm`;
  document.querySelector('#cloudCover').textContent = `${formatNumber(current.cloud_cover)}%`;
  document.querySelector('#windSpeed').textContent = `${formatNumber(current.wind_speed_10m, 1)} km/h`;
  document.querySelector('#weatherTheme').textContent = `Tema: ${theme}`;
  document.querySelector('#results').hidden = false;
  animateWeatherIn();

  return theme;
}

function renderArtwork(artwork) {
  const image = document.querySelector('#artworkImage');
  const panel = document.querySelector('#artworkPanel');
  panel.hidden = true;
  const url = artwork.image;
  image.onload = () => {
    panel.hidden = false;
    fitArtwork();
    animateArtworkIn();
    samplePalette(url).then((palette) => {
      if (palette && image.src === url) {
        window.gallerySky?.setTheme(lastShown.theme, { sun: lastShown.sun, tint: palette });
      }
    });
  };
  image.onerror = () => {
    panel.hidden = false;
    setStatus('A imagem da obra não carregou. Abra o link do museu para vê-la.', 'error');
  };
  image.src = url;
  image.alt = artwork.title ? `${artwork.title}, ${artwork.artist}` : 'Obra de arte';
  document.querySelector('#artworkTitle').textContent = artwork.title || 'Título não informado';
  document.querySelector('#artworkArtist').textContent = artwork.artistDetail || artwork.artist;
  document.querySelector('#artworkDate').textContent = artwork.date || 'Data não informada';
  const link = document.querySelector('#artworkLink');
  link.href = artwork.url;
  link.textContent = `Ver no ${artwork.source}`;
}

function setLoading(isLoading) {
  const button = document.querySelector('#searchButton');
  button.disabled = isLoading;
  document.querySelector('#searchForm').classList.toggle('is-loading', isLoading);
}

async function loadGallery(cityOrName) {
  const cityName = typeof cityOrName === 'string' ? cityOrName : cityOrName?.name || '';
  if (!cityName.trim()) {
    setStatus('Digite o nome de uma cidade para começar.', 'error');
    return;
  }

  setLoading(true);
  window.gallerySky?.setBusy(true);
  setStatus(typeof cityOrName === 'string' ? `Procurando ${cityName.trim()}…` : `Lendo o céu de ${cityName}…`, 'loading');
  animateArtworkOut();

  try {
    const city = typeof cityOrName === 'string' ? await findCity(cityOrName) : cityOrName;
    setStatus(`Lendo o céu de ${city.name}…`, 'loading');
    const weather = await getWeather(city);
    const theme = renderWeather(city, weather);
    rememberCity(city);
    setStatus('Escolhendo uma obra para este céu…', 'loading');
    const artwork = await findArtwork(getArtKeywords(theme), theme);
    renderArtwork(artwork);
    setStatus('Galeria atualizada.', 'success');
  } catch (error) {
    setStatus(error.message || 'Não foi possível carregar a galeria.', 'error');
  } finally {
    setLoading(false);
    window.gallerySky?.setBusy(false);
  }
}

// ---------- cidades recentes ----------

function readRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function rememberCity(city) {
  const entry = {
    name: city.name,
    country: city.country,
    admin1: city.admin1,
    latitude: city.latitude,
    longitude: city.longitude,
  };
  const list = [entry, ...readRecent().filter((item) => !(item.name === entry.name && item.country === entry.country))]
    .slice(0, RECENT_LIMIT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // sem armazenamento, sem histórico
  }
  renderRecent();
}

function renderRecent() {
  const container = document.querySelector('#recent');
  if (!container) return;
  const list = readRecent();
  container.innerHTML = '';
  container.hidden = list.length === 0;
  if (!list.length) return;

  const label = document.createElement('span');
  label.className = 'recent-label';
  label.textContent = 'antes:';
  container.appendChild(label);

  list.forEach((city) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'recent-city';
    button.textContent = city.name;
    button.title = formatCityPlace(city);
    button.addEventListener('click', () => {
      document.querySelector('#cityInput').value = city.name;
      document.querySelector('#cityInput').dispatchEvent(new Event('fit'));
      loadGallery(city);
    });
    container.appendChild(button);
  });
}

// ---------- favicon ----------

const FAVICON_COLORS = {
  rest: '#e9c88a',
  clear: '#f2c14e',
  cloudy: '#9aa6b2',
  fog: '#c5c9cc',
  rain: '#5b7fa3',
  snow: '#dfe8f0',
  storm: '#4a4f7d',
  night: '#f4f1de',
};

function setFavicon(theme) {
  const link = document.querySelector('link[rel="icon"]');
  if (!link) return;
  const color = FAVICON_COLORS[theme] || FAVICON_COLORS.rest;
  const bg = theme === 'night' || theme === 'storm' ? '%23101433' : 'none';
  link.href = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='${bg}'/%3E%3Ccircle cx='16' cy='16' r='11' fill='${encodeURIComponent(color)}'/%3E%3C/svg%3E`;
}

// ---------- motion ----------

const hasGsap = () => typeof window !== 'undefined' && typeof window.gsap !== 'undefined';
const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function animateTemperature(target) {
  const element = document.querySelector('#temperature');
  if (!hasGsap() || reducedMotion()) {
    element.textContent = String(target);
    return;
  }
  const counter = { value: Number(element.textContent) || 0 };
  gsap.to(counter, {
    value: target,
    duration: 1.6,
    ease: 'power3.out',
    onUpdate: () => {
      element.textContent = String(Math.round(counter.value));
    },
  });
}

function animateWeatherIn() {
  if (!hasGsap() || reducedMotion()) return;
  const parts = document.querySelectorAll(
    '.weather-city, .weather-time, .weather-temp, .weather-desc, .weather-feels, .weather-details div',
  );
  gsap.fromTo(
    parts,
    { opacity: 0, y: 18 },
    { opacity: 1, y: 0, duration: 1.1, stagger: 0.06, ease: 'expo.out', overwrite: 'auto', clearProps: 'transform' },
  );
}

// Desktop: limita a altura da imagem ao espaço livre entre o topo do painel e
// a legenda, para que quadro + informação caibam sem rolar. Mobile: livre.
function fitArtwork() {
  const panel = document.querySelector('#artworkPanel');
  const frame = document.querySelector('.frame');
  const image = document.querySelector('#artworkImage');
  const caption = document.querySelector('.caption');
  if (!panel || panel.hidden) return;

  const desktop = window.matchMedia('(min-width: 52rem)').matches;
  if (!desktop) {
    image.style.maxHeight = '';
    return;
  }

  const frameStyle = getComputedStyle(frame);
  const chrome =
    parseFloat(frameStyle.paddingTop) + parseFloat(frameStyle.paddingBottom) +
    parseFloat(frameStyle.borderTopWidth) + parseFloat(frameStyle.borderBottomWidth);
  const captionStyle = getComputedStyle(caption);
  const captionSpace = caption.offsetHeight + parseFloat(captionStyle.marginTop);
  const available = panel.clientHeight - captionSpace - chrome;
  image.style.maxHeight = `${Math.max(160, Math.floor(available))}px`;
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', fitArtwork);
  document.fonts?.ready.then(fitArtwork);
}

// O quadro balança com o vento real (km/h). Amplitude curta, ruído lento.
let windTicker = null;
function setWindOnFrame(kmh) {
  const frame = document.querySelector('.frame');
  if (!frame || !hasGsap()) return;
  if (windTicker) gsap.ticker.remove(windTicker);
  const strength = Math.min(1, Math.max(0, kmh) / 45);
  if (reducedMotion() || strength < 0.05) {
    frame.style.transform = '';
    return;
  }
  const amp = 1.5 + strength * 4;
  const rate = 0.6 + strength * 1.4;
  windTicker = (time) => {
    const t = time * rate;
    const x = Math.sin(t * 0.9) * 0.6 + Math.sin(t * 2.3 + 1.7) * 0.4;
    const y = Math.sin(t * 0.7 + 0.5) * 0.5 + Math.sin(t * 1.9 + 2.1) * 0.5;
    const r = Math.sin(t * 0.5 + 1.1) * 0.35 * strength;
    frame.style.transform = `translate(${(x * amp).toFixed(2)}px, ${(y * amp * 0.6).toFixed(2)}px) rotate(${r.toFixed(3)}deg)`;
  };
  gsap.ticker.add(windTicker);
}

function animateArtworkOut() {
  const panel = document.querySelector('#artworkPanel');
  if (panel.hidden) return;
  if (!hasGsap() || reducedMotion()) {
    panel.hidden = true;
    return;
  }
  const frame = document.querySelector('.frame');
  const caption = document.querySelectorAll('.caption > *');
  gsap.to(caption, { opacity: 0, y: -8, duration: 0.5, ease: 'power2.in', stagger: 0.03 });
  gsap.to(frame, {
    clipPath: 'inset(0 0 100% 0)',
    duration: 0.8,
    ease: 'expo.in',
    onComplete: () => {
      panel.hidden = true;
    },
  });
}

function animateArtworkIn() {
  if (!hasGsap() || reducedMotion()) return;
  const frame = document.querySelector('.frame');
  const image = document.querySelector('#artworkImage');
  const caption = document.querySelectorAll('.caption > *');
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  tl.fromTo(frame, { clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0% 0 0 0)', duration: 1.5 })
    .fromTo(image, { scale: 1.1 }, { scale: 1, duration: 2.2, clearProps: 'transform' }, 0)
    .fromTo(caption, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 1, stagger: 0.07, clearProps: 'transform' }, 0.5);
}

// ---------- city selector ----------

function createCitySelector({ input, list, form, mirror, onSelect }) {
  let items = [];
  let activeIndex = -1;
  let debounce = null;
  let requestId = 0;

  function fitInput() {
    mirror.textContent = input.value || input.placeholder;
    input.style.width = `${Math.ceil(mirror.getBoundingClientRect().width) + 4}px`;
    form.classList.toggle('is-filled', input.value.trim().length > 0);
  }

  function close() {
    clearTimeout(debounce);
    requestId += 1;
    list.hidden = true;
    list.innerHTML = '';
    items = [];
    activeIndex = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function setActive(index) {
    activeIndex = index;
    list.querySelectorAll('.suggestion').forEach((element, i) => {
      const active = i === index;
      element.setAttribute('aria-selected', active ? 'true' : 'false');
      if (active) input.setAttribute('aria-activedescendant', element.id);
    });
  }

  function open(results) {
    items = results;
    list.innerHTML = '';

    if (!results.length) {
      const empty = document.createElement('li');
      empty.className = 'suggestion-empty';
      empty.textContent = 'Nenhuma cidade com esse nome.';
      list.appendChild(empty);
    }

    results.forEach((city, index) => {
      const item = document.createElement('li');
      item.className = 'suggestion';
      item.id = `suggestion-${index}`;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', 'false');

      const name = document.createElement('span');
      name.className = 'suggestion-name';
      name.textContent = city.name;

      const place = document.createElement('span');
      place.className = 'suggestion-place';
      place.textContent = formatCityPlace(city);

      item.append(name, place);
      item.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        choose(index);
      });
      list.appendChild(item);
    });

    const field = input.parentElement;
    const left = Math.max(0, field.offsetLeft);
    list.style.left = `${left}px`;
    list.style.maxWidth = `calc(100% - ${left}px)`;
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(-1);

    if (hasGsap() && !reducedMotion()) {
      gsap.fromTo(list, { opacity: 0, y: -6, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: 'expo.out' });
      gsap.fromTo(list.children, { opacity: 0, x: -6 }, { opacity: 1, x: 0, duration: 0.5, stagger: 0.04, ease: 'expo.out' });
    }
  }

  function choose(index) {
    const city = items[index];
    if (!city) return;
    input.value = city.name;
    fitInput();
    close();
    onSelect(city);
  }

  async function search(value) {
    const id = ++requestId;
    try {
      const results = await searchCities(value, 5);
      if (id !== requestId || document.activeElement !== input) return;
      open(results);
    } catch {
      if (id === requestId) close();
    }
  }

  input.addEventListener('input', () => {
    fitInput();
    clearTimeout(debounce);
    const value = input.value.trim();
    if (value.length < 2) {
      close();
      return;
    }
    debounce = setTimeout(() => search(value), 220);
  });

  input.addEventListener('keydown', (event) => {
    if (list.hidden || !items.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((activeIndex + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((activeIndex - 1 + items.length) % items.length);
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      choose(activeIndex);
    } else if (event.key === 'Escape') {
      close();
    }
  });

  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('fit', fitInput);
  window.addEventListener('resize', fitInput);
  document.fonts?.ready.then(fitInput);
  fitInput();

  return { close, fitInput };
}

if (typeof document !== 'undefined') {
  const form = document.querySelector('#searchForm');
  const input = document.querySelector('#cityInput');

  const selector = createCitySelector({
    input,
    form,
    list: document.querySelector('#suggestions'),
    mirror: document.querySelector('#cityMirror'),
    onSelect: (city) => loadGallery(city),
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    selector.close();
    loadGallery(input.value);
  });

  renderRecent();

  const soundButton = document.querySelector('#soundToggle');
  soundButton?.addEventListener('click', async () => {
    if (!window.gallerySound) return;
    const on = await window.gallerySound.toggle();
    window.gallerySound.setTheme(lastShown.theme);
    soundButton.setAttribute('aria-pressed', on ? 'true' : 'false');
    soundButton.querySelector('.sound-label').textContent = on ? 'Som ligado' : 'Som';
  });

  if (hasGsap() && !reducedMotion()) {
    gsap.fromTo(
      ['.site-header', '.prompt-sentence', '.site-footer'],
      { opacity: 0, y: 14 },
      { opacity: 1, y: 0, duration: 1.4, stagger: 0.12, ease: 'expo.out', delay: 0.15, clearProps: 'transform' },
    );
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    getWeatherTheme,
    getWeatherDescription,
    getArtKeywords,
    formatTemperature,
    scoreArtwork,
  };
}
