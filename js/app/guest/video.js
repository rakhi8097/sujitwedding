import { progress } from './progress.js';
import { util } from '../../common/util.js';
import { cache } from '../../connection/cache.js';
import { HTTP_GET, request, HTTP_STATUS_OK, HTTP_STATUS_PARTIAL_CONTENT } from '../../connection/request.js';

export const video = (() => {

    /**
     * @type {ReturnType<typeof cache>|null}
     */
    let c = null;

    /**
     * @returns {Promise<void>}
     */
    const load = () => {
        const wraps = document.querySelectorAll('[data-video-wrapper]');
        
        const tasks = Array.from(wraps).map((wrap) => {
            if (!wrap || !wrap.hasAttribute('data-src')) {
                wrap?.remove();
                return Promise.resolve();
            }

            const src = wrap.getAttribute('data-src');
            if (!src) {
                return Promise.resolve();
            }

            const vid = document.createElement('video');
            vid.className = wrap.getAttribute('data-vid-class') || '';
            vid.loop = true;
            vid.muted = wrap.getAttribute('data-muted') !== 'false';
            vid.controls = false;
            vid.autoplay = false;
            vid.playsInline = true;
            vid.preload = 'metadata';

            const observer = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting ? vid.play() : vid.pause()));

            /**
             * @param {Blob} b
             * @returns {void}
             */
            const prepareVideo = (b) => {
                vid.preload = 'auto';
                if (wrap.id === 'video-love-stroy') {
                    vid.controls = true;
                    vid.disableRemotePlayback = true;
                    vid.disablePictureInPicture = true;
                    vid.controlsList = 'noremoteplayback nodownload noplaybackrate';
                }
                vid.src = URL.createObjectURL(b);
            };

            /**
             * @returns {Promise<Response>}
             */
            const fetchBasic = () => {
                const bar = wrap.querySelector('[data-video-progress-bar]');
                const inf = wrap.querySelector('[data-video-progress-info]');

                return request(HTTP_GET, src).withNoBody().default({ 'Range': 'bytes=0-1' }).then((res) => {

                    if (res.status === HTTP_STATUS_OK) {
                        vid.preload = 'none';
                        vid.src = util.escapeHtml(src);
                        wrap.appendChild(vid);

                        return Promise.resolve();
                    }

                    if (res.status !== HTTP_STATUS_PARTIAL_CONTENT) {
                        throw new Error('failed to fetch video');
                    }

                    vid.addEventListener('error', () => progress.invalid('video'));
                    const loaded = new Promise((r) => vid.addEventListener('loadedmetadata', r, { once: true }));

                    vid.src = util.escapeHtml(src);
                    wrap.appendChild(vid);

                    return loaded;
                }).then(() => {
                    vid.pause();
                    vid.currentTime = 0;

                    const height = vid.getBoundingClientRect().width * (vid.videoHeight / vid.videoWidth);
                    vid.style.height = `${height}px`;
                    wrap.style.height = `${height}px`;

                    return request(HTTP_GET, src).withRetry().withProgressFunc((a, b) => {
                        const result = Number((a / b) * 100).toFixed(0) + '%';

                        if (bar) bar.style.width = result;
                        if (inf) inf.innerText = result;
                    }).default();
                }).then((res) => res.clone().blob().then((b) => {
                    const loaded = new Promise((r) => vid.addEventListener('loadedmetadata', r, { once: true }));
                    prepareVideo(b);
                    vid.load();
                    return loaded.then(() => res);
                })).catch((err) => {
                    if (bar) bar.style.backgroundColor = 'red';
                    if (inf) inf.innerText = `Error loading video`;
                    console.error(err);
                });
            };

            const isExternal = src.startsWith('http');
            const isHeavy = src.includes('Sujit%20Pre%20Wed.mp4') || src.includes('Sujit Pre Wed.mp4');

            if (isExternal || isHeavy) {
                vid.src = util.escapeHtml(src);
                vid.autoplay = true;
                vid.playsInline = true;
                wrap.appendChild(vid);
                observer.observe(vid);
                wrap.querySelector('[data-video-loading]')?.remove();
                return Promise.resolve();
            }

            return c.has(src).then((res) => {
                if (!res) {
                    return c.del(src).then(fetchBasic).then((r) => c.set(src, r));
                }

                return res.blob().then((b) => {
                    const loaded = new Promise((r) => vid.addEventListener('loadedmetadata', r, { once: true }));
                    prepareVideo(b);
                    wrap.appendChild(vid);
                    return loaded;
                });
            }).then(() => {
                observer.observe(vid);
                vid.style.removeProperty('height');
                wrap.style.removeProperty('height');
                wrap.querySelector('[data-video-loading]')?.remove();
            });
        });

        return Promise.all(tasks).finally(() => progress.complete('video'));
    };

    /**
     * @returns {object}
     */
    const init = () => {
        progress.add();
        c = cache('video').withForceCache();

        return {
            load,
        };
    };

    return {
        init,
    };
})();