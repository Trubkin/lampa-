(function () {
    'use strict';

    var PLUGIN_ID = 'serialytut_web';
    var STORAGE_MIRROR = 'serialytut_mirror_url';
    var DEFAULT_MIRROR = 'https://serialytut.me';

    function startPlugin() {
        Lampa.SettingsApi.addParam({
            component: 'parser',
            param: {
                name: STORAGE_MIRROR,
                type: 'input',
                values: '',
                default: DEFAULT_MIRROR
            },
            field: {
                name: 'Serialytut: адрес сайта',
                description: 'Зеркало сайта для открытия в окне'
            },
            onChange: function (val) {
                Lampa.Storage.set(STORAGE_MIRROR, val.trim());
            }
        });

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
            var siteUrl = (Lampa.Storage.get(STORAGE_MIRROR, DEFAULT_MIRROR) || DEFAULT_MIRROR).trim();

            var overlay = $(
                '<div style="position: fixed; inset: 0; z-index: 9999; background: #000;">' +
                    '<iframe src="' + siteUrl + '" style="width: 100%; height: 100%; border: none;" allowfullscreen allow="autoplay; encrypted-media"></iframe>' +
                '</div>'
            );

            $('body').append(overlay);

            var prevController = Lampa.Controller.enabled().name;

            Lampa.Controller.add('serialytut_frame', {
                toggle: function () {},
                back: function () {
                    overlay.remove();
                    Lampa.Controller.toggle(prevController || 'menu');
                }
            });

            Lampa.Controller.toggle('serialytut_frame');
            Lampa.Noty.show('Нажмите «Назад» на пульте для возврата в Lampa');
        });

        $('.menu .menu__list').eq(0).append(menuItem);
    }

    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') startPlugin();
        });
    }
})();
