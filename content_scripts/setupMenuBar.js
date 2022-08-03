createNameSpace('realityEditor.gui');

(function(exports) {
    let menuBar = null;

    const MENU = Object.freeze({
        View: 'View',
        Camera: 'Camera',
        History: 'History',
        Help: 'Help'
    });
    exports.MENU = MENU;

    const ITEM = Object.freeze({
        PointClouds: 'Point Clouds',
        SpaghettiMap: 'Spaghetti Map',
        ModelVisibility: 'Model Visibility',
        ModelTexture: 'Model Texture',
        UnityVirtualizers: 'Unity Virtualizers',
        SurfaceAnchors: 'Surface Anchors',
        VideoPlayback: 'Video Timeline',
        Follow1stPerson: 'Follow 1st-Person',
        Follow3rdPerson: 'Follow 3rd-Person',
        StopFollowing: 'Stop Following',
        ResetPaths: 'Reset Paths',
        TogglePaths: 'Toggle Paths',
        ClonePatch: 'Clone Patch',
        UndoPatch: 'Undo Patch',
        OrbitCamera: 'Orbit Camera',
        ResetCameraPosition: 'Reset Camera Position',
        GettingStarted: 'Getting Started',
    });
    exports.ITEM = ITEM;

    // sets up the initial contents of the menuBar
    // other modules can add more to it by calling getMenuBar().addItemToMenu(menuName, menuItem)
    const setupMenuBar = () => {
        if (menuBar) { return; }

        const MenuBar = realityEditor.gui.MenuBar;
        const Menu = realityEditor.gui.Menu;
        const MenuItem = realityEditor.gui.MenuItem;

        menuBar = new MenuBar();
        // menuBar.addMenu(new Menu('File'));
        // menuBar.addMenu(new Menu('Edit'));
        menuBar.addMenu(new Menu(MENU.View));
        menuBar.addMenu(new Menu(MENU.Camera));
        menuBar.addMenu(new Menu(MENU.History));
        menuBar.addMenu(new Menu(MENU.Help));

        const togglePointClouds = new MenuItem(ITEM.PointClouds, { shortcutKey: 'M', toggle: true, defaultVal: true, disabled: true }, (value) => {
            console.log('toggle point clouds', value);
        });
        menuBar.addItemToMenu(MENU.View, togglePointClouds);

        const toggleSpaghetti = new MenuItem(ITEM.SpaghettiMap, { shortcutKey: 'N', toggle: true, defaultVal: false, disabled: true }, null);
        menuBar.addItemToMenu(MENU.View, toggleSpaghetti);

        const toggleModelVisibility = new MenuItem(ITEM.ModelVisibility, { shortcutKey: 'T', toggle: true, defaultVal: true }, null); // other module can attach a callback later
        menuBar.addItemToMenu(MENU.View, toggleModelVisibility);

        const toggleModelTexture = new MenuItem(ITEM.ModelTexture, { shortcutKey: 'Y', toggle: true, defaultVal: true }, null);
        menuBar.addItemToMenu(MENU.View, toggleModelTexture);

        const toggleUnityVirtualizers = new MenuItem(ITEM.UnityVirtualizers, { shortcutKey: 'V', toggle: true, defaultVal: false }, null); // other module can attach a callback later
        menuBar.addItemToMenu(MENU.View, toggleUnityVirtualizers);

        const toggleSurfaceAnchors = new MenuItem(ITEM.SurfaceAnchors, { shortcutKey: 'SEMICOLON', toggle: true, defaultVal: false }, null); // other module can attach a callback later
        menuBar.addItemToMenu(MENU.View, toggleSurfaceAnchors);

        const toggleVideoPlayback = new MenuItem(ITEM.VideoPlayback, { shortcutKey: 'OPEN_BRACKET', toggle: true, defaultVal: false }, null); // other module can attach a callback later
        menuBar.addItemToMenu(MENU.View, toggleVideoPlayback);

        const resetRzvHistory = new MenuItem(ITEM.ResetPaths, { shortcutKey: 'R', disabled: true }, null);
        menuBar.addItemToMenu(MENU.History, resetRzvHistory);

        const toggleRzvHistory = new MenuItem(ITEM.TogglePaths, { shortcutKey: 'E', toggle: true, defaultVal: false, disabled: true }, null);
        menuBar.addItemToMenu(MENU.History, toggleRzvHistory);

        const clonePatch = new MenuItem(ITEM.ClonePatch, { shortcutKey: 'P', disabled: true }, null);
        menuBar.addItemToMenu(MENU.History, clonePatch);

        const undoPatch = new MenuItem(ITEM.UndoPatch, { shortcutKey: '', disabled: true }, null);
        menuBar.addItemToMenu(MENU.History, undoPatch);

        const stopFollowing = new MenuItem(ITEM.StopFollowing, { shortcutKey: '_0', toggle: false, disabled: true }, null);
        menuBar.addItemToMenu(MENU.Camera, stopFollowing);

        const orbitCamera = new MenuItem(ITEM.OrbitCamera, { shortcutKey: 'O', toggle: true, defaultVal: false }, null);
        menuBar.addItemToMenu(MENU.Camera, orbitCamera);

        const resetCamera = new MenuItem(ITEM.ResetCameraPosition, { shortcutKey: 'ESCAPE' }, null);
        menuBar.addItemToMenu(MENU.Camera, resetCamera);

        const gettingStarted = new MenuItem(ITEM.GettingStarted, null, () => {
            // TODO: build a better Getting Started / Help experience
            window.open('https://spatialtoolbox.vuforia.com/', '_blank');
        });
        menuBar.addItemToMenu(MENU.Help, gettingStarted);

        document.body.appendChild(menuBar.domElement);

        // Offset certain UI elements that align to the top of the screen, such as the envelope X button
        realityEditor.device.environment.variables.screenTopOffset = menuBar.domElement.getBoundingClientRect().height;
    };

    const getMenuBar = () => { // use this to access the shared MenuBar instance
        if (!menuBar) {
            try {
                setupMenuBar();
            } catch (e) {
                console.warn(e);
            }
        }
        return menuBar;
    };

    exports.setupMenuBar = setupMenuBar;
    exports.getMenuBar = getMenuBar;

})(realityEditor.gui);
