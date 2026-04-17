export function showNotification(message) {
    const n = document.getElementById('notification');
    n.textContent = message;
    n.classList.add('show');
    setTimeout(() => n.classList.remove('show'), 2000);
}

export function showProcessIndicator(show) {
    document.getElementById('processIndicator').classList.toggle('visible', show);
}
