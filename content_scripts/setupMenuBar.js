createNameSpace('realityEditor.gui');

(function(exports) {
    let menuBar = null;

    // sets up the initial contents of the menuBar
    // other modules can add more to it by calling getMenuBar().addItemToMenu(menuName, menuItem)
    exports.setupMenuBar = () => {
        const MenuBar = realityEditor.gui.MenuBar;
        const Menu = realityEditor.gui.Menu;
        const MenuItem = realityEditor.gui.MenuItem;

        menuBar = new MenuBar();
        // menuBar.addMenu(new Menu('File'));
        // menuBar.addMenu(new Menu('Edit'));
        menuBar.addMenu(new Menu('View'));
        menuBar.addMenu(new Menu('History'));
        menuBar.addMenu(new Menu('Help'));

        const togglePointClouds = new MenuItem('Point Clouds', { shortcutKey: 'M', toggle: true, defaultVal: true, disabled: true }, (value) => {
            console.log('toggle point clouds', value);
        });
        menuBar.addItemToMenu('View', togglePointClouds);

        const toggleSpaghetti = new MenuItem('Spaghetti Map', { shortcutKey: 'N', toggle: true, defaultVal: false, disabled: true }, (value) => {
            console.log('toggle spaghetti map', value);
        });
        menuBar.addItemToMenu('View', toggleSpaghetti);

        const toggleModelTexture = new MenuItem('Model Texture',
            { shortcutKey: 'T', toggle: true, defaultVal: true }, null); // other module can attach a callback later
        menuBar.addItemToMenu('View', toggleModelTexture);

        const resetCamera = new MenuItem('Reset Camera Position', { shortcutKey: 'ESCAPE' }, null);
        menuBar.addItemToMenu('View', resetCamera);

        const resetRzvHistory = new MenuItem('Reset Paths', { shortcutKey: 'R' }, null);
        menuBar.addItemToMenu('History', resetRzvHistory);

        const toggleRzvHistory = new MenuItem('Toggle Paths', { shortcutKey: 'E', toggle: true, defaultVal: true }, null);
        menuBar.addItemToMenu('History', toggleRzvHistory);

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
