createNameSpace('realityEditor.gui');

(function(exports) {
    let menuBar = null;
    exports.setupMenuBar = () => {
        const MenuBar = realityEditor.gui.MenuBar;
        const Menu = realityEditor.gui.Menu;
        const MenuItem = realityEditor.gui.MenuItem;

        menuBar = new MenuBar();
        // menuBar.addMenu(new Menu('File'));
        // menuBar.addMenu(new Menu('Edit'));
        menuBar.addMenu(new Menu('View'));
        menuBar.addMenu(new Menu('Help'));

        const togglePointClouds = new MenuItem('Point Clouds', { shortcutKey: 'M', toggle: true, defaultVal: true, disabled: true }, () => {
            console.log('toggle point clouds');
        });
        menuBar.addItemToMenu('View', togglePointClouds);

        const toggleSpaghetti = new MenuItem('Spaghetti Map', { shortcutKey: 'N', toggle: true, defaultVal: false, disabled: true }, () => {
            console.log('toggle spaghetti map');
        });
        menuBar.addItemToMenu('View', toggleSpaghetti);

        const toggleModelTexture = new MenuItem('Model Texture', { shortcutKey: 'T', toggle: true, defaultVal: true }, () => {
            console.log('toggle model texture');
        });
        menuBar.addItemToMenu('View', toggleModelTexture);

        const gettingStarted = new MenuItem('Getting Started', null, () => {
            console.log('open getting started in new tab');
        });
        menuBar.addItemToMenu('Help', gettingStarted);

        document.body.appendChild(menuBar.domElement);
    };

    exports.getMenuBar = () => { // use this to access the shared MenuBar instance
        if (!menuBar) {
            this.setupMenuBar();
        }
        return menuBar;
    };
})(realityEditor.gui);
