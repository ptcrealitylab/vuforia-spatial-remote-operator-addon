createNameSpace('realityEditor.gui.MenuBar');

(function(exports) {
    class MenuBar {
        constructor() {
            this.menus = [];
        }
        addMenu(menu) {
            this.menus.push(menu);
        }
        redraw() {
            // build DOM element for menu bar
            // add DOM element for each menu
            // tell each menu to redraw
        }
    }

    class Menu {
        constructor() {
            this.items = [];
        }
        addItem(menuItem) {
            this.items.push(menuItem);
        }
        redraw() {
            
        }
    }

    class MenuItem {
        constructor(text, onClick, shortcutKey) {
            this.text = text;
            this.onClick = onClick;
        }
    }

    class MenuItemToggle {
        constructor(text, onToggleOn, onToggleOff, shortcutKey) {
            this.text = text;
            this.onToggleOn = onToggleOn;
            this.onToggleOff = onToggleOff;
        }
    }

    exports.MenuBar = MenuBar;
})(realityEditor.gui);
