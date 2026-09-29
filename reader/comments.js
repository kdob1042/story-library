(() => {
  const section = document.getElementById('episodeComments');
  if (!section) return;
  const form = document.getElementById('commentForm');
  const fields = document.getElementById('commentFields');
  const name = document.getElementById('commentName');
  const body = document.getElementById('commentBody');
  const count = document.getElementById('commentCount');
  const status = document.getElementById('commentStatus');
  const list = document.getElementById('commentList');
  const retry = document.getElementById('commentRetry');
  const more = document.getElementById('commentMore');
  const drafts = new Map();
  let selection = null;
  let generation = 0;
  let nextCursor = null;
  let loading = false;
  const messages = {
    already_commented: 'このエピソードには投稿済みです。',
    cookies_required: '投稿にはCookieが必要です。Cookieを有効にして再読み込みしてください。',
    comments_not_configured: 'コメントはまだ受け付けていません。',
    comments_unavailable: 'コメントを読み込めませんでした。しばらくしてからお試しください。',
    not_found: 'このエピソードのコメントは現在利用できません。',
    invalid_request: 'お名前は40文字以内、コメントは1〜1,000文字で入力してください。',
  };
  const selectionKey = value => `${value.workId}/${value.episodeId}`;
  function url(cursor) {
    const params = new URLSearchParams({work: selection.workId, episode: selection.episodeId});
    if (cursor) params.set('before', cursor);
    return '/api/comments?' + params;
  }
  async function readResponse(response) {
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(messages[data.error] || '通信に失敗しました。再度お試しください。'), {code: data.error});
    return data;
  }
  function renderComment(comment) {
    const item = document.createElement('li');
    const meta = document.createElement('div');
    meta.className = 'comment-meta';
    const author = document.createElement('strong');
    author.textContent = comment.name;
    const date = document.createElement('time');
    date.className = 'comment-muted';
    date.dateTime = comment.created_at;
    date.textContent = new Intl.DateTimeFormat('ja-JP', {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(comment.created_at));
    const text = document.createElement('p');
    text.className = 'comment-text';
    text.textContent = comment.body;
    meta.append(author, date);
    item.append(meta, text);
    return item;
  }
  function updateCount() { count.textContent = [...body.value].length.toLocaleString('ja-JP') + ' / 1,000文字'; }
  function rememberDraft() {
    if (selection) drafts.set(selectionKey(selection), {name: name.value, body: body.value});
  }
  async function load(append = false) {
    if (!selection || loading) return;
    const version = generation;
    loading = true;
    retry.hidden = true;
    more.disabled = true;
    status.textContent = 'コメントを読み込んでいます…';
    if (!append) { form.hidden = true; fields.disabled = true; }
    try {
      const data = await readResponse(await fetch(url(append ? nextCursor : null), {credentials: 'same-origin', cache: 'no-store'}));
      if (version !== generation) return;
      if (!append) list.replaceChildren();
      data.comments.forEach(comment => list.appendChild(renderComment(comment)));
      form.hidden = data.submitted;
      fields.disabled = false;
      status.textContent = data.submitted ? 'このエピソードには投稿済みです。' : list.children.length ? '' : 'まだコメントはありません。';
      nextCursor = data.nextCursor;
      more.hidden = !nextCursor;
    } catch (error) {
      if (version !== generation) return;
      status.textContent = error instanceof Error ? error.message : 'コメントを読み込めませんでした。';
      retry.hidden = false;
    } finally {
      if (version === generation) { loading = false; more.disabled = false; }
    }
  }
  window.episodeComments = {
    hide() {
      rememberDraft();
      generation++;
      loading = false;
      selection = null;
      section.hidden = true;
    },
    show(value) {
      rememberDraft();
      generation++;
      loading = false;
      selection = value;
      list.replaceChildren();
      nextCursor = null;
      more.hidden = true;
      section.hidden = false;
      document.getElementById('commentEpisodeLabel').textContent = value.label;
      const draft = drafts.get(selectionKey(value));
      name.value = draft?.name || '';
      body.value = draft?.body || '';
      updateCount();
      load();
    },
  };
  body.addEventListener('input', updateCount);
  retry.addEventListener('click', () => load());
  more.addEventListener('click', () => load(true));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!selection || fields.disabled || loading) return;
    if (!body.value.trim()) { body.focus(); return; }
    const version = generation;
    const submittedKey = selectionKey(selection);
    fields.disabled = true;
    retry.hidden = true;
    more.disabled = true;
    status.textContent = '投稿しています…';
    try {
      const data = await readResponse(await fetch(url(), {
        method: 'POST', credentials: 'same-origin',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name: name.value, body: body.value}),
      }));
      drafts.delete(submittedKey);
      if (version !== generation) return;
      body.value = '';
      updateCount();
      form.hidden = true;
      list.prepend(renderComment(data.comment));
      status.textContent = '投稿しました。このエピソードへのコメントは1件までです。';
    } catch (error) {
      if (version !== generation) return;
      status.textContent = error instanceof Error ? error.message : '投稿できませんでした。再度お試しください。';
      if (error.code === 'already_commented') { form.hidden = true; retry.hidden = false; }
      else fields.disabled = false;
    } finally {
      if (version === generation) more.disabled = false;
    }
  });
})();
