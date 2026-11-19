(function () {
    'use strict';

    var PLUGIN_ID = 'serialytut_plugin';
    var STORAGE_MIRROR = 'serialytut_mirror_url';
    var STORAGE_PROXY = 'serialytut_cors_proxy';
    var DEFAULT_MIRROR = 'https://serialytut.me';

    // Цепочка публичных CORS-прокси для веб-версии (GET-запросы через чистый fetch без лишних заголовков)
    var FALLBACK_PROXIES = [
        function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); },
        function (u) { return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u); },
        function (u) { return 'https://corsproxy.io/?url=' + encodeURIComponent(u); }
    ];

    function fetchWithFallback(url, onSuccess, onError) {
        var customProxy = (Lampa.Storage.get(STORAGE_PROXY, '') || '').trim();
        var queue = [];

        if (customProxy) {
            queue.push(function (u) { return customProxy + encodeURIComponent(u); });
        }

        // На Android/SmartTV сначала пробуем прямой запрос через нативный движок Lampa
        var isWeb = location.protocol.indexOf('http') === 0 && !window.AndroidJS && !(window.lampa_settings && window.lampa_settings.native);
        if (!isWeb) {
            queue.push(function (u) { return u; });
        }

        FALLBACK_PROXIES.forEach(function (fn) {
            queue.push(fn);
        });

        var index = 0;

        function tryNext() {
            if (index >= queue.length) {
                if (onError) onError(new Error('Все прокси недоступны или заблокированы'));
                return;
            }

            var buildUrl = queue[index++];
            var targetUrl = buildUrl(url);

            fetch(targetUrl, {
                method: 'GET',
                credentials: 'omit'
            })
                .then(function (res) {
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    return res.text();
                })
                .then(function (text) {
                    if (!text || text.length < 100) throw new Error('Пустой ответ');
                    onSuccess(text);
                })
                .catch(function (err) {
                    console.warn('[Serialytut] Попытка ' + index + ' не удалась (' + targetUrl + '):', err.message);
                    tryNext();
                });
        }

        tryNext();
    }

    function getBaseUrl() {
        return (Lampa.Storage.get(STORAGE_MIRROR, DEFAULT_MIRROR) || DEFAULT_MIRROR).replace(/\/+$/, '');
    }

    function buildSearchUrl(baseUrl, query) {
        return baseUrl + '/index.php?do=search&subaction=search&story=' + encodeURIComponent(query);
    }

    // Регистрация компонента каталога/поиска для главного меню
    function registerCatalogComponent() {
        Lampa.Component.add(PLUGIN_ID, function (object) {
            var scroll = new Lampa.Scroll({ mask: true, over: true, step: 250 });
            var html = $('<div class="category-full"></div>');
            var info = $('<div style="padding: 1.5em; font-size: 1.2em; opacity: 0.8;">Загрузка каталога...</div>');
            var lastFocused;

            this.create = function () {
                html.append(info);
                scroll.append(html);
                this.activity.loader(true);
                loadCatalog(object.search || '');
                return this.render();
            };

            var self = this;

            function loadCatalog(query) {
                var baseUrl = getBaseUrl();
                var url = query ? buildSearchUrl(baseUrl, query) : baseUrl + '/';

                fetchWithFallback(
                    url,
                    function (rawHtml) {
                        self.activity.loader(false);
                        info.remove();

                        var items = parseCardsFromHtml(rawHtml, baseUrl);

                        var searchBtn = $(
                            '<div class="selector" style="padding: 1em 1.5em; margin: 0 1.5em 1em; background: rgba(255,255,255,0.1); border-radius: 0.5em; display: inline-block;">' +
                                '🔍 Поиск по сайту' + (query ? ' (' + query + ')' : '') +
                            '</div>'
                        );

                        searchBtn.on('hover:enter', function () {
                            Lampa.Input.edit({
                                title: 'Поиск на Serialytut',
                                value: query || '',
                                free: true,
                                nosave: true
                            }, function (newQuery) {
                                if (newQuery) {
                                    Lampa.Activity.push({
                                        url: '',
                                        title: 'Serialytut: ' + newQuery,
                                        component: PLUGIN_ID,
                                        search: newQuery,
                                        page: 1
                                    });
                                }
                            });
                        });

                        searchBtn.on('hover:focus', function (e) {
                            lastFocused = e.target;
                            scroll.update($(e.target), true);
                        });

                        html.append(searchBtn);

                        if (!items.length) {
                            html.append('<div style="padding: 1.5em;">Ничего не найдено или сайт вернул защиту от ботов. Попробуйте другое зеркало в Настройки → Парсер.</div>');
                            Lampa.Controller.enable('content');
                            return;
                        }

                        var grid = $('<div style="display: flex; flex-wrap: wrap; padding: 0 1em;"></div>');

                        items.forEach(function (item) {
                            var card = $(
                                '<div class="selector" style="width: 14em; margin: 0.6em; background: rgba(255,255,255,0.06); border-radius: 0.6em; overflow: hidden;">' +
                                    '<div style="height: 20em; background: #1c1c1c url(\'' + (item.poster || '') + '\') center/cover no-repeat;"></div>' +
                                    '<div style="padding: 0.7em; font-size: 0.95em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + item.title + '</div>' +
                                '</div>'
                            );

                            card.on('hover:focus', function (e) {
                                lastFocused = e.target;
                                scroll.update($(e.target), true);
                            });

                            card.on('hover:enter', function () {
                                openSerialSources(item.title, item.url);
                            });

                            grid.append(card);
                        });

                        html.append(grid);
                        Lampa.Controller.enable('content');
                    },
                    function () {
                        self.activity.loader(false);
                        info.text('Не удалось загрузить сайт ни через один прокси. Проверьте доступность зеркала в Настройки → Парсер.');
                    }
                );
            }

            this.start = function () {
                Lampa.Controller.add('content', {
                    toggle: function () {
                        Lampa.Controller.collectionSet(scroll.render());
                        Lampa.Controller.collectionFocus(lastFocused || false, scroll.render());
                    },
                    left: function () {
                        if (Navigator.canmove('left')) Navigator.move('left');
                        else Lampa.Controller.toggle('menu');
                    },
                    right: function () {
                        Navigator.move('right');
                    },
                    up: function () {
                        if (Navigator.canmove('up')) Navigator.move('up');
                        else Lampa.Controller.toggle('head');
                    },
                    down: function () {
                        Navigator.move('down');
                    },
                    back: function () {
                        Lampa.Activity.backward();
                    }
                });
                Lampa.Controller.toggle('content');
            };

            this.pause = function () {};
            this.stop = function () {};
            this.render = function () {
                return scroll.render();
            };
            this.destroy = function () {
                scroll.destroy();
                html.remove();
            };
        });
    }

    // Парсинг карточек сериалов из HTML (универсально под DLE)
    function parseCardsFromHtml(rawHtml, baseUrl) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(rawHtml, 'text/html');
        var results = [];
        var seen = {};

        var links = doc.querySelectorAll('a[href*=".html"]');
        links.forEach(function (a) {
            var href = a.getAttribute('href') || '';
            if (!href || href.indexOf('#') !== -1) return;
            if (href.indexOf('http') !== 0) {
                href = baseUrl + (href.indexOf('/') === 0 ? '' : '/') + href;
            }
            if (href.indexOf(baseUrl) !== 0 || seen[href]) return;

            var cardContainer = a.closest('article, .short, .movie-item, .th-item, .item') || a.parentElement;
            var img = cardContainer ? cardContainer.querySelector('img') : null;
            var poster = '';
            if (img) {
                poster = img.getAttribute('data-src') || img.getAttribute('src') || '';
                if (poster && poster.indexOf('http') !== 0) {
                    poster = baseUrl + (poster.indexOf('/') === 0 ? '' : '/') + poster;
                }
            }

            var title = (a.getAttribute('title') || a.textContent || '').trim();
            if (title.length < 3 || /^(смотреть|подробнее|далее)$/i.test(title)) {
                var heading = cardContainer ? cardContainer.querySelector('h2, h3, .title, .th-title') : null;
                if (heading) title = heading.textContent.trim();
            }

            if (title.length > 2) {
                seen[href] = true;
                results.push({
                    title: title,
                    url: href,
                    poster: poster
                });
            }
        });

        return results;
    }

    // Поиск конкретного тайтла из карточки Lampa
    function searchFromMovieCard(movie) {
        var title = movie.title || movie.name || '';
        if (!title) {
            Lampa.Noty.show('Не удалось определить название');
            return;
        }

        Lampa.Noty.show('Поиск «' + title + '»...');
        var baseUrl = getBaseUrl();

        fetchWithFallback(
            buildSearchUrl(baseUrl, title),
            function (rawHtml) {
                var items = parseCardsFromHtml(rawHtml, baseUrl);
                if (!items.length) {
                    Lampa.Noty.show('На сайте ничего не найдено');
                    return;
                }

                Lampa.Select.show({
                    title: 'Результаты поиска',
                    items: items.map(function (it) {
                        return { title: it.title, url: it.url };
                    }),
                    onSelect: function (selected) {
                        openSerialSources(selected.title, selected.url);
                    },
                    onBack: function () {
                        Lampa.Controller.toggle('content');
                    }
                });
            },
            function () {
                Lampa.Noty.show('Ошибка загрузки через CORS-прокси');
            }
        );
    }

    // Извлечение потоков (.m3u8/.mp4) и iframe со страницы сериала
    function openSerialSources(title, pageUrl) {
        Lampa.Noty.show('Получаем ссылки на видео...');

        fetchWithFallback(
            pageUrl,
            function (html) {
                var streams = extractDirectStreams(html);
                var parser = new DOMParser();
                var doc = parser.parseFromString(html, 'text/html');
                var iframes = doc.querySelectorAll('iframe');

                var options = [];

                streams.forEach(function (streamUrl, i) {
                    options.push({
                        title: '▶ Прямой поток #' + (i + 1),
                        subtitle: streamUrl,
                        type: 'direct',
                        url: streamUrl
                    });
                });

                iframes.forEach(function (frame, i) {
                    var src = frame.getAttribute('src') || frame.getAttribute('data-src') || '';
                    if (src && !/(google|yandex|vk\.com\/widget)/i.test(src)) {
                        if (src.indexOf('//') === 0) src = 'https:' + src;
                        options.push({
                            title: '🎬 Балансер / Плеер #' + (i + 1),
                            subtitle: src,
                            type: 'iframe',
                            url: src
                        });
                    }
                });

                if (!options.length) {
                    Lampa.Noty.show('Плеер на странице не найден');
                    return;
                }

                Lampa.Select.show({
                    title: title,
                    items: options,
                    onSelect: function (choice) {
                        if (choice.type === 'direct') {
                            Lampa.Player.play({
                                title: title,
                                url: choice.url
                            });
                        } else {
                            resolveIframeAndPlay(title, choice.url);
                        }
                    },
                    onBack: function () {
                        Lampa.Controller.toggle('content');
                    }
                });
            },
            function () {
                Lampa.Noty.show('Не удалось загрузить страницу сериала');
            }
        );
    }

    // Попытка достать .m3u8/.mp4 из iframe или открыть в браузере/окне
    function resolveIframeAndPlay(title, iframeUrl) {
        Lampa.Noty.show('Извлекаем поток из балансера...');

        fetchWithFallback(
            iframeUrl,
            function (iframeHtml) {
                var directLinks = extractDirectStreams(iframeHtml);

                if (directLinks.length) {
                    var playlist = directLinks.map(function (link, idx) {
                        return {
                            title: title + ' (Вариант ' + (idx + 1) + ')',
                            url: link
                        };
                    });

                    Lampa.Player.play(playlist);
                    if (playlist.length > 1) {
                        Lampa.Player.playlist(playlist);
                    }
                } else {
                    Lampa.Noty.show('Балансер защищён JS — открываем плеер в окне');
                    window.open(iframeUrl, '_blank');
                }
            },
            function () {
                window.open(iframeUrl, '_blank');
            }
        );
    }

    // Поиск всех ссылок .m3u8 и .mp4 в тексте страницы/скриптов
    function extractDirectStreams(text) {
        var matches = text.match(/https?:\/\/[^\s"'<>\\]+\.(?:m3u8|mp4)(?:\?[^\s"'<>\\]*)?/gi) || [];
        var unique = [];
        matches.forEach(function (m) {
            var clean = m.replace(/\\\//g, '/');
            if (unique.indexOf(clean) === -1) unique.push(clean);
        });
        return unique;
    }

    // Инициализация интерфейса Lampa
    function initPlugin() {
        registerCatalogComponent();

        Lampa.SettingsApi.addParam({
            component: 'parser',
            param: {
                name: STORAGE_MIRROR,
                type: 'input',
                values: '',
                default: DEFAULT_MIRROR
            },
            field: {
                name: 'Serialytut: зеркало сайта',
                description: 'Актуальный адрес сайта (например, https://serialytut.me)'
            },
            onChange: function (val) {
                Lampa.Storage.set(STORAGE_MIRROR, val.trim());
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'parser',
            param: {
                name: STORAGE_PROXY,
                type: 'input',
                values: '',
                default: ''
            },
            field: {
                name: 'Serialytut: свой CORS-прокси (необязательно)',
                description: 'Оставьте пустым для авто-подбора прокси'
            },
            onChange: function (val) {
                Lampa.Storage.set(STORAGE_PROXY, val.trim());
            }
        });

        // Кнопка в левом главном меню Lampa
        var menuItem = $(
            '<li class="menu__item selector" data-action="' + PLUGIN_ID + '">' +
                '<div class="menu__ico">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">' +
                        '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>' +
                        '<line x1="8" y1="21" x2="16" y2="21"></line>' +
                        '<line x1="12" y1="17" x2="12" y2="21"></line>' +
                    '</svg>' +
                '</div>' +
                '<div class="menu__text">Serialytut</div>' +
            '</li>'
        );

        menuItem.on('hover:enter', function () {
            Lampa.Activity.push({
                url: '',
                title: 'Serialytut',
                component: PLUGIN_ID,
                page: 1
            });
        });

        $('.menu .menu__list').eq(0).append(menuItem);

        // Кнопка внутри карточки фильма/сериала
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
                    searchFromMovieCard(movie);
                });

                render.find('.full-start__buttons').append(btn);
            }
        });
    }

    if (window.appready) {
        initPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') initPlugin();
        });
    }
})();
