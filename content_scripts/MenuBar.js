createNameSpace('realityEditor.gui');

(function(exports) {
    class MenuBar {
        constructor() {
            this.menus = [];
            this.openMenu = null;
            this.buildDom();
        }
        buildDom() {
            this.domElement = document.createElement('div');
            this.domElement.classList.add('desktopMenuBar');
        }
        addMenu(menu) {
            this.menus.push(menu);
            this.domElement.appendChild(menu.domElement);
            menu.onMenuTitleClicked = this.onMenuTitleClicked.bind(this);
        }
        onMenuTitleClicked(menu) {
            if (menu.isOpen) {
                if (this.openMenu) {
                    this.openMenu.closeDropdown();
                }
                this.openMenu = menu;
            }
        }
        addItemToMenu(menuName, item) {
            let menu = this.menus.find(menu => {
                return menu.name === menuName;
            });
            if (!menu) {
                menu = new Menu(menuName);
                this.menus.push(menu);
            }
            menu.addItem(item);
            this.redraw();
        }
        redraw() {
            // build DOM element for menu bar
            // add DOM element for each menu
            this.menus.forEach((menu, index) => {
                menu.redraw(index);
            });
            // tell each menu to redraw
        }
    }

    class Menu {
        constructor(name) {
            this.name = name;
            this.items = [];
            this.isOpen = false;
            this.buildDom();
            this.menuIndex = 0;
            this.onMenuTitleClicked = null; // MenuBar can inject callback here to coordinate multiple menus
        }
        buildDom() {
            this.domElement = document.createElement('div');
            this.domElement.classList.add('desktopMenuBarMenu');
            const title = document.createElement('div');
            title.classList.add('desktopMenuBarMenuTitle');
            title.innerText = this.name;
            this.domElement.appendChild(title);
            const dropdown = document.createElement('div');
            dropdown.classList.add('desktopMenuBarMenuDropdown');
            dropdown.classList.add('hiddenDropdown');
            this.domElement.appendChild(dropdown);

            title.addEventListener('pointerdown', () => {
                this.isOpen = !this.isOpen;
                this.redraw();
                if (typeof this.onMenuTitleClicked === 'function') {
                    this.onMenuTitleClicked(this);
                }
            });
        }
        closeDropdown() {
            this.isOpen = false;
            this.redraw();
        }
        addItem(menuItem) {
            this.items.push(menuItem);
            let dropdown = this.domElement.querySelector('.desktopMenuBarMenuDropdown');
            dropdown.appendChild(menuItem.domElement);
        }
        redraw(index) {
            if (typeof index !== 'undefined') { this.menuIndex = index; }
            this.domElement.style.left = (100 * this.menuIndex) + 'px';

            let dropdown = this.domElement.querySelector('.desktopMenuBarMenuDropdown');
            let title = this.domElement.querySelector('.desktopMenuBarMenuTitle');
            if (this.isOpen) {
                dropdown.classList.remove('hiddenDropdown');
                title.classList.add('desktopMenuBarMenuTitleOpen');
            } else {
                dropdown.classList.add('hiddenDropdown');
                title.classList.remove('desktopMenuBarMenuTitleOpen');
            }

            // add DOM element for each item
            this.items.forEach((item, itemIndex) => {
                item.redraw(itemIndex);
            });
            // build DOM element for menu
            // update DOM to fit the number of elements, and the open/close state
        }
    }

    class MenuItem {
        constructor(text, options, onClick) {
            this.text = text;
            this.onClick = onClick;
            this.options = options; // shortcutKey, toggle?
            this.buildDom();
        }
        buildDom() {
            this.domElement = document.createElement('div');
            this.domElement.classList.add('desktopMenuBarItem');
            this.domElement.innerText = this.text;
        }
        redraw() {
            // update state
        }
    }

    // class MenuItemToggle {
    //     constructor(text, onToggleOn, onToggleOff, shortcutKey) {
    //         this.text = text;
    //         this.onToggleOn = onToggleOn;
    //         this.onToggleOff = onToggleOff;
    //     }
    // }

    exports.MenuBar = MenuBar;
    // exports = {
    //     addMenu: (menu) => {
    //
    //     },
    //     addItemToMenu: (menuName, item) => {
    //
    //     }
    // };
    exports.Menu = Menu;
    exports.MenuItem = MenuItem;
    // exports.MenuItemToggle;
})(realityEditor.gui);
