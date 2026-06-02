const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

const WATCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

function parseYoutubeId(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();

  if (YOUTUBE_ID_RE.test(trimmed)) return trimmed;

  try {
    const url = trimmed.startsWith('http') ? new URL(trimmed) : new URL(`https://${trimmed}`);

    if (url.hostname.includes('youtu.be')) {
      const id = url.pathname.slice(1).split('/')[0];
      return YOUTUBE_ID_RE.test(id) ? id : null;
    }

    if (url.hostname.includes('youtube.com') || url.hostname.includes('youtube-nocookie.com')) {
      const v = url.searchParams.get('v');
      if (v && YOUTUBE_ID_RE.test(v)) return v;

      const embed = url.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
      if (embed) return embed[1];

      const shorts = url.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (shorts) return shorts[1];
    }
  } catch {
    return null;
  }

  return null;
}

function parseDurationSeconds(html) {
  const match =
    html.match(/"lengthSeconds":"(\d+)"/) ||
    html.match(/"lengthSeconds":(\d+)/) ||
    html.match(/"approxDurationMs":"(\d+)"/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  if (Number.isNaN(value)) return null;
  return match[0].includes('approxDurationMs') ? Math.round(value / 1000) : value;
}

function youtubeThumbnailUrl(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

async function fetchYoutubeMeta(videoId) {
  if (!YOUTUBE_ID_RE.test(videoId)) {
    throw new Error('Invalid YouTube video ID');
  }

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;

  const [oembedRes, pageRes] = await Promise.all([
    fetch(oembedUrl),
    fetch(watchUrl, { headers: WATCH_HEADERS }),
  ]);

  if (!oembedRes.ok) {
    throw new Error('Could not load video info. Check the URL and try again.');
  }

  const data = await oembedRes.json();
  let duration = null;
  if (pageRes.ok) {
    const html = await pageRes.text();
    duration = parseDurationSeconds(html);
  }

  return {
    videoId,
    title: data.title || 'Untitled',
    thumbnail: data.thumbnail_url || youtubeThumbnailUrl(videoId),
    channel: data.author_name || null,
    duration,
  };
}

module.exports = {
  parseYoutubeId,
  fetchYoutubeMeta,
  youtubeThumbnailUrl,
};
