const status = document.getElementById('status');
document.getElementById('cancel').addEventListener('click', () => window.capturePicker.cancel());
document.addEventListener('keydown', event => { if (event.key === 'Escape') void window.capturePicker.cancel(); });
window.capturePicker.list().then(sources => {
  status.textContent = sources.length ? 'Select a source to begin sharing.' : 'No sources available. Check operating-system capture permissions.';
  for (const source of sources) {
    const button = document.createElement('button');
    const thumbnail = document.createElement('img');
    thumbnail.src = source.thumbnail;
    thumbnail.alt = '';
    const name = document.createElement('span');
    name.textContent = source.name;
    button.append(thumbnail, name);
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await window.capturePicker.select(source.id); }
      catch { status.textContent = 'The source is unavailable. Cancel and choose again.'; }
    });
    document.getElementById('sources').append(button);
  }
}).catch(() => { status.textContent = 'Could not list sources. Cancel and try again.'; });
