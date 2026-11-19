(function () {
    'use strict';

    var NAME = 'series_online';
    var STORAGE_URL = NAME + '_url';

    /*
     * Контракт источника (ваш сервер должен отдавать JSON):
     *
     * GET {base}/series?tmdb_id=123&title=Name&year=2020
     * -> {
     *      "seasons": [
     *        { "number": 1,
     *          "episodes": [
     *            { "number": 1, "title": "Pilot", "url": "https://.../s01e01.m3u8" }
     *          ]
     *        }
     *      ]
     *    }
     */

    function component(object) {
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var html = $('<div class="' + NAME + '"></div>');
        var body = $('<div class="' + NAME + '__body"></div>');
        var last;
        var seasons = [];
        var current_season = null;
        var self = this;

        this.create = function () {
            this.activity.loader(true);
            scroll.minus();
            html.append(scroll.render());
            scroll.append(body);
            this.load();
            return this.render();
        };

        this.load = function () {
            var base = (Lampa.Storage.get(STORAGE_URL, '') + '').replace(/\/+$/, '');

            if (!base) {
                return this.empty('Не указан адрес источника. Настройки → Series Online.');
            }

            var movie = object.movie || {};
            var year = ((movie.first_air_date || movie.release_date || '0000') + '').slice(0, 4);
            var url = base + '/series?tmdb_id=' + encodeURIComponent(movie.id || '') +
                '&title=' + encodeURIComponent(movie.name || movie.title || '') +
                '&year=' + year;

            network.timeout(15000);
            network.silent(url, function (json) {
                seasons = (json && json.seasons) || [];
                if (!seasons.length) return self.empty('Источник ничего не нашёл.');
                self.showSeasons();
            }, function () {
                self.empty('Ошибка запроса к источнику.');
            });
        };

        this.empty = function (text) {
            body.empty().append($('<div class="' + NAME + '__empty">' + text + '</div>'));
            this.activity.loader(false);
            this.activity.toggle();
        };

        this.append = function (title, subtitle, onenter) {
            var item = $(
                '<div class="' + NAME + '__item selector">' +
                '<div class="' + NAME + '__title">' + title + '</div>' +
                (subtitle ? '<div class="' + NAME + '__sub">' + subtitle + '</div>' : '') +
                '</div>'
            );

            item.on('hover:focus', function (e) {
                last = e.target;
                scroll.update($(e.target), true);
            }).on('hover:enter', onenter);

            body.append(item);
        };

        this.showSeasons = function () {
            current_season = null;
            body.empty();

            seasons.forEach(function (season) {
                self.append(
                    'Сезон ' + season.number,
                    (season.episodes || []).length + ' эп.',
                    function () { self.showEpisodes(season); }
                );
            });

            this.activity.loader(false);
            this.activity.toggle();
        };

        this.showEpisodes = function (season) {
            current_season = season;
            last = null;
            body.empty();

            var playlist = (season.episodes || []).map(function (ep) {
                return {
                    title: 'S' + season.number + ' E' + ep.number + (ep.title ? ' · ' + ep.title : ''),
                    url: ep.url
                };
            });

            playlist.forEach(function (item) {
                self.append(item.title, '', function () {
                    if (!item.url) return Lampa.Noty.show('У серии нет ссылки');
                    Lampa.Player.play(item);
                    Lampa.Player.playlist(playlist);
                });
            });

            this.activity.toggle();
        };

        this.start = function () {
            if (Lampa.Activity.active().activity !== this.activity) return;

            Lampa.Controller.add(NAME, {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(last || false, scroll.render());
                },
                up: function () {
                    if (Navigator.canmove('up')) Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },
                down: function () {
                    if (Navigator.canmove('down')) Navigator.move('down');
                },
                left: function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                right: function () {
                    if (Navigator.canmove('right')) Navigator.move('right');
                },
                back: function () {
                    // из списка серий возвращаемся к сезонам, потом выходим
                    if (current_season) self.showSeasons();
                    else Lampa.Activity.backward();
                }
            });

            Lampa.Controller.toggle(NAME);
        };

        this.render = function () { return html; };
        this.pause = function () {};
        this.stop = function () {};
        this.destroy = function () {
            network.clear();
            scroll.destroy();
            html.remove();
            body.remove();
        };
    }

    function addStyles() {
        $('head').append(
            '<style>' +
            '.' + NAME + '__body{padding:1.5em}' +
            '.' + NAME + '__item{padding:1em 1.5em;margin-bottom:.7em;border-radius:.4em;background:rgba(255,255,255,.07)}' +
            '.' + NAME + '__item.focus{background:#fff;color:#000}' +
            '.' + NAME + '__title{font-size:1.3em}' +
            '.' + NAME + '__sub{opacity:.6;margin-top:.3em}' +
            '.' + NAME + '__empty{padding:2em;font-size:1.3em;opacity:.7}' +
            '</style>'
        );
    }

    function addButton() {
        Lampa.Listener.follow('full', function (e) {
            if (e.type !== 'complite') return;

            var movie = e.data.movie;
            // только сериалы
            if (!(movie.name || movie.number_of_seasons || movie.first_air_date)) return;

            var btn = $(
                '<div class="full-start__button selector view--' + NAME + '">' +
                '<span>Смотреть онлайн</span>' +
                '</div>'
            );

            btn.on('hover:enter', function () {
                Lampa.Activity.push({
                    url: '',
                    title: movie.name || movie.title,
                    component: NAME,
                    movie: movie,
                    page: 1
                });
            });

            var render = e.object.activity.render();
            var after = render.find('.view--torrent');
            if (after.length) after.after(btn);
            else render.find('.full-start__buttons, .full-start-new__buttons').first().append(btn);
        });
    }

    function addSettings() {
        if (!Lampa.SettingsApi) return;

        Lampa.SettingsApi.addComponent({
            component: NAME,
            name: 'Series Online',
            icon: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'
        });

        Lampa.SettingsApi.addParam({
            component: NAME,
            param: { name: STORAGE_URL, type: 'input', 'default': '', placeholder: 'https://my-server.local/api' },
            field: { name: 'Адрес источника', description: 'Базовый URL вашего JSON-источника' }
        });
    }

    function start() {
        if (window['plugin_' + NAME + '_ready']) return;
        window['plugin_' + NAME + '_ready'] = true;

        Lampa.Component.add(NAME, component);
        addStyles();
        addSettings();
        addButton();
    }

    if (window.appready) start();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') start();
        });
    }
})();
