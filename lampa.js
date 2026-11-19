
(function () {
    'use strict';

    var STORAGE_KEY = 'serialytut_mirror_url';
    var DEFAULT_URL = 'https://serialytut.me';

    function startPlugin() {
        // 1. Настройка зеркала сайта в разделе "Парсер"
        Lampa.SettingsApi.addParam({
            component: 'parser',
            param: {
                name: STORAGE_KEY,
                type: 'input',
                values: '',
                default: DEFAULT_URL
            },
            field: {
                name: 'Зеркало Serialytut',
                description: 'Базовый URL сайта (например, https://serialytut.me)'
            },
            onChange: function (value) {
                Lampa.Storage.set(STORAGE_KEY, value.trim());
            }
        });

        // 2. Кнопка в карточке сериала/фильма
        Lampa.Listener.follow('full', function (e) {
            if (e.type === 'complite') {
                var render = e.object.activity.render();
                var movie = e.data.movie;

                render.find('.button--serialytut').remove();

                var btn = $(
                    '<div class="full-start__button selector button--serialytut">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">' +
                            '<polygon points="5 3 19 12 5 21 5 3"></polygon>' +
                        '</svg>' +
                        '<span>Serialytut</span>' +
                    '</div>'
                );

                btn.on('hover:enter', function () {
                    searchOnSite(movie);
                });

                render.find('.full-start__buttons').append(btn);
            }
        });
    }

    // 3. Поиск через стандартный обработчик DLE (/index.php?do=search)
    function searchOnSite(movie) {
        var baseUrl = (Lampa.Storage.get(STORAGE_KEY, DEFAULT_URL) || DEFAULT_URL).replace(/\/+$/, '');
        var title = movie.title || movie.name || '';

        if (!title) {
            Lampa.Noty.show('Не удалось определить название');
            return;
        }

        Lampa.Noty.show('Поиск на ' + baseUrl + '...');

        var network = new Lampa.Reguest();
        var searchUrl = baseUrl + '/index.php?do=search';

        // DLE принимает поиск POST-запросом с параметрами do=search, subaction=search, story=...
        var postData = {
            do: 'search',
            subaction: 'search',
            story: title
        };

        network.native(searchUrl, function (html) {
            var parser = new DOMParser();
            var doc = parser.parseFromString(html, 'text/html');
            var items = [];
            var seen = {};

            // Ищем ссылки на карточки сериалов (в DLE это обычно ссылки внутри кратких новостей)
            var links = doc.querySelectorAll('a[href*=".html"]');

            links.forEach(function (a) {
                var href = a.getAttribute('href') || '';
                var text = (a.textContent || '').trim();

                // Отсеиваем служебные ссылки, комментарии и дубликаты
                if (
                    text.length > 2 &&
                    text.toLowerCase() !== 'смотреть' &&
                    text.toLowerCase() !== 'подробнее' &&
                    href.indexOf('#') === -1 &&
                    !seen[href]
                ) {
                    if (href.indexOf('http') !== 0) {
                        href = baseUrl + (href.indexOf('/') === 0 ? '' : '/') + href;
                    }

                    // Проверяем, что ссылка относится к нашему домену
                    if (href.indexOf(baseUrl) === 0) {
                        seen[href] = true;
                        items.push({
                            title: text,
                            url: href
                        });
                    }
                }
            });

            if (!items.length) {
                Lampa.Noty.show('Ничего не найдено на сайте');
                return;
            }

            Lampa.Select.show({
                title: 'Результаты Serialytut',
                items: items,
                onSelect: function (selected) {
                    parsePageIframe(selected.title, selected.url);
                },
                onBack: function () {
                    Lampa.Controller.toggle('content');
                }
            });

        }, function () {
            Lampa.Noty.show('Ошибка подключения к сайту или блокировка CORS');
        }, postData, {
            dataType: 'text'
        });
    }

    // 4. Извлечение iframe-плеера со страницы выбранного сериала
    function parsePageIframe(title, pageUrl) {
        Lampa.Noty.show('Загружаем страницу сериала...');
        var network = new Lampa.Reguest();

        network.native(pageUrl, function (html) {
            var parser = new DOMParser();
            var doc = parser.parseFromString(html, 'text/html');

            // Ищем все iframe на странице (обычно там плеер балансера)
            var iframes = doc.querySelectorAll('iframe');
            var players = [];

            iframes.forEach(function (frame, idx) {
                var src = frame.getAttribute('src') || frame.getAttribute('data-src') || '';
                if (src && src.indexOf('google') === -1 && src.indexOf('yandex') === -1) {
                    if (src.indexOf('//') === 0) src = 'https:' + src;
                    players.push({
                        title: 'Плеер #' + (idx + 1),
                        subtitle: src,
                        url: src
                    });
                }
            });

            if (!players.length) {
                Lampa.Noty.show('Iframe-плеер на странице не найден');
                return;
            }

            Lampa.Select.show({
                title: title + ' — Источники',
                items: players,
                onSelect: function (player) {
                    // Внимание: стандартный плеер Lampa играет прямые потоки (.m3u8/.mp4).
                    // Ссылку на iframe нужно либо открывать во внешнем браузере/WebView,
                    // либо дополнительно разбирать API конкретного балансера.
                    Lampa.Noty.show('URL плеера: ' + player.url);
                    console.log('Extracted player iframe:', player.url);
                },
                onBack: function () {
                    Lampa.Controller.toggle('content');
                }
            });

        }, function () {
            Lampa.Noty.show('Не удалось загрузить страницу сериала');
        }, false, {
            dataType: 'text'
        });
    }

    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') startPlugin();
        });
    }
})();
