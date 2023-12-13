createNameSpace('realityEditor.gui');

(function(exports) {
    let _keyboard;
    function getKeyboard() {
        if (!_keyboard) {
            _keyboard = new realityEditor.device.KeyboardListener();
        }
        return _keyboard;
    }

    class MenuBar {
        constructor() {
            this.menus = [];
            this.openMenu = null;
            this.buildDom();
            this.setupKeyboard();
        }
        buildDom() {
            this.domElement = document.createElement('div');
            this.domElement.classList.add('desktopMenuBar');
        }
        setupKeyboard() {
            getKeyboard().onKeyDown((code, modifiers) => {
                if (realityEditor.device.keyboardEvents.isKeyboardActive()) { return; } // ignore if a tool is using the keyboard

                // check with each of the menu items, whether this triggers anything
                this.menus.forEach(menu => {
                    menu.items.forEach(item => {
                        if (typeof item.onKeyDown === 'function') {
                            try {
                                item.onKeyDown(code, modifiers);
                            } catch (e) {
                                console.warn('Error in MenuBar item.onKeyDown', e);
                            }
                        }
                        // also add keyboard shortcuts to one-level-deep of submenus
                        if (item.hasSubmenu) {
                            item.submenu.items.forEach(subItem => {
                                if (typeof subItem.onKeyDown === 'function') {
                                    try {
                                        subItem.onKeyDown(code, modifiers);
                                    } catch (e) {
                                        console.warn('Error in MenuBar subItem.onKeyDown', e);
                                    }
                                }
                            });
                        }
                    });
                });
            });
        }
        addMenu(menu) {
            this.menus.push(menu);
            this.domElement.appendChild(menu.domElement);
            menu.onMenuTitleClicked = this.onMenuTitleClicked.bind(this);
        }
        hideMenu(menu) {
            if (menu.isHidden) { return; }
            menu.isHidden = true;
            this.redraw();
        }
        unhideMenu(menu) {
            if (!menu.isHidden) { return; }
            menu.isHidden = false;
            this.redraw();
        }
        disableMenu(menu) {
            if (menu.isDisabled) { return; }
            menu.isDisabled = true;
            this.redraw();
        }
        enableMenu(menu) {
            if (!menu.isDisabled) { return; }
            menu.isDisabled = false;
            this.redraw();
        }
        onMenuTitleClicked(menu) {
            if (menu.isOpen) {
                if (this.openMenu && this.openMenu !== menu) {
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
        removeItemFromMenu(menuName, itemText) {
            let menu = this.menus.find(menu => {
                return menu.name === menuName;
            });
            if (!menu) return;
            menu.removeItem(itemText);
            this.redraw();
        }
        // Note: assumes items in different menus don't have duplicate names
        addCallbackToItem(itemName, callback) {
            let item = this.getItemByName(itemName);
            if (item) {
                item.addCallback(callback);
            }
        }
        setItemEnabled(itemName, enabled) {
            let item = this.getItemByName(itemName);
            if (item) {
                if (enabled) {
                    item.enable();
                } else {
                    item.disable();
                }
            }
        }
        getItemByName(itemName) {
            let match = null;
            this.menus.forEach(menu => {
                if (match) { return; } // only add to the first match
                // search the menu and one-level-deep of submenus for the matching item
                let item = menu.items.find(item => {
                    if (item.hasSubmenu) {
                        return item.submenu.items.find(subItem => {
                            return subItem.text === itemName;
                        });
                    }
                    return item.text === itemName;
                });
                if (item) {
                    if (item.hasSubmenu) {
                        match = item.submenu.items.find(subItem => {
                            return subItem.text === itemName;
                        });
                    } else {
                        match = item;
                    }
                }
            });
            return match;
        }
        redraw() {
            let numHidden = 0;
            // tell each menu to redraw
            this.menus.forEach((menu, index) => {
                menu.redraw(index - numHidden);
                if (menu.isHidden) {
                    numHidden++;
                }
            });
        }
    }

    class Menu {
        constructor(name) {
            this.name = name;
            this.items = [];
            this.isOpen = false;
            this.isHidden = false;
            this.isDisabled = false;
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
            let existingIndex = this.items.indexOf(menuItem);
            if (existingIndex > -1) {
                this.items.splice(existingIndex, 1); // move item to bottom if already contains it
            }
            this.items.push(menuItem);
            let dropdown = this.domElement.querySelector('.desktopMenuBarMenuDropdown');
            dropdown.appendChild(menuItem.domElement);
            menuItem.parent = this;
        }
        removeItem(itemText) {
            let itemIndex = this.items.map(item => item.text).indexOf(itemText);
            if (itemIndex < 0) return;
            let menuItem = this.items[itemIndex];
            let dropdown = this.domElement.querySelector('.desktopMenuBarMenuDropdown');
            dropdown.removeChild(menuItem.domElement);
            this.items.splice(itemIndex, 1);
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

            this.items.forEach((item, itemIndex) => {
                item.redraw(itemIndex);
            });

            if (this.isHidden) {
                this.domElement.style.display = 'none';
            } else {
                this.domElement.style.display = '';
            }

            if (this.isDisabled) {
                this.domElement.classList.add('desktopMenuBarMenuTitleDisabled');
            } else {
                this.domElement.classList.remove('desktopMenuBarMenuTitleDisabled');
            }
        }
    }

    class MenuItem {
        constructor(text, options, onClick) {
            this.text = text;
            this.callbacks = [];
            if (onClick) {
                this.addCallback(onClick);
            }
            // options include: { shortcutKey: 'M', modifiers: ['SHIFT', 'ALT'], toggle: true, defaultVal: true, disabled: true }
            // note: shortcutKey should be an entry in the KeyboardListener's keyCodes
            this.options = options || {};
            this.buildDom();
            this.parent = null;
        }
        buildDom() {
            this.domElement = document.createElement('div');
            this.domElement.classList.add('desktopMenuBarItem');

            let textElement = document.createElement('div');
            textElement.classList.add('desktopMenuBarItemText');
            textElement.innerText = this.text;

            if (this.options.isSeparator) {
                this.domElement.classList.add('desktopMenuBarItemSeparator');
                textElement.innerHTML = '<hr>';
            }

            if (this.options.toggle) {
                let checkmark = document.createElement('div');
                checkmark.classList.add('desktopMenuBarItemCheckmark');
                checkmark.innerText = '✓';

                textElement.classList.add('desktopMenuBarItemTextToggle');

                if (!this.options.defaultVal) {
                    checkmark.classList.add('desktopMenuBarItemCheckmarkHidden');
                }
                this.domElement.appendChild(checkmark);
            }

            this.domElement.appendChild(textElement);

            // shortcutKey: 'M', modifiers: ['SHIFT', 'ALT'], toggle: true, defaultVal: true, disabled: true
            if (this.options.shortcutKey) {
                const shortcut = document.createElement('div');
                shortcut.classList.add('desktopMenuBarItemShortcut');
                shortcut.innerText = getShortcutDisplay(this.options.shortcutKey);
                this.domElement.appendChild(shortcut);

                const shortcutModifier = document.createElement('div');
                shortcutModifier.classList.add('desktopMenuBarItemShortcutModifier');
                shortcutModifier.innerText = this.options.modifiers ? this.options.modifiers.map(modifier => getShortcutDisplay(modifier)).join(' ') : '';
                this.domElement.appendChild(shortcutModifier);

                const thisKeyCode = getKeyboard().keyCodes[this.options.shortcutKey];
                const thisModifiers = this.options.modifiers ? this.options.modifiers.map(modifier => getKeyboard().keyCodes[modifier]) : [];
                const modifierSetsMatch = (modifierSet1, modifierSet2) => {
                    return modifierSet1.length === modifierSet2.length && modifierSet1.every(value => modifierSet2.includes(value));
                }
                this.onKeyDown = function(code, activeModifiers) {
                    if (code === thisKeyCode && modifierSetsMatch(thisModifiers, activeModifiers)) {
                        this.triggerItem();
                    }
                };
            }

            if (this.options.disabled) {
                this.disable();
            }

            this.domElement.addEventListener('pointerup', () => {
                let succeeded = this.triggerItem();
                if (succeeded) {
                    this.parent.closeDropdown();
                }
            });
        }
        triggerItem() {
            if (this.domElement.classList.contains('desktopMenuBarItemDisabled')) {
                return false;
            }
            let toggled = this.options.toggle ? this.switchToggle() : undefined;
            this.callbacks.forEach(cb => {
                cb(toggled);
            });
            return true;
        }
        switchToggle() {
            if (!this.options.toggle) { return; }
            let checkmark = this.domElement.querySelector('.desktopMenuBarItemCheckmark');

            if (checkmark.classList.contains('desktopMenuBarItemCheckmarkHidden')) {
                checkmark.classList.remove('desktopMenuBarItemCheckmarkHidden');
                return true;
            } else {
                checkmark.classList.add('desktopMenuBarItemCheckmarkHidden');
                return false;
            }
        }
        disable() {
            this.domElement.classList.add('desktopMenuBarItemDisabled');
            let checkmark = this.domElement.querySelector('.desktopMenuBarItemCheckmark');
            if (checkmark) {
                checkmark.classList.add('desktopMenuBarItemCheckmarkDisabled');
            }
        }
        enable() {
            this.domElement.classList.remove('desktopMenuBarItemDisabled');
            let checkmark = this.domElement.querySelector('.desktopMenuBarItemCheckmark');
            if (checkmark) {
                checkmark.classList.remove('desktopMenuBarItemCheckmarkDisabled');
            }
        }
        redraw() {
            // currently not used, but can be used to update UI each time menu opens, closes, or contents change
        }
        addCallback(callback) {
            this.callbacks.push(callback);
        }
    }

    // when adding a keyboard shortcut, conform to the naming of the keyboard.keyCodes enum
    // this function maps those names to human-readable shortcut keys to display in the menu
    const getShortcutDisplay = (keyCodeName) => {
        if (keyCodeName === 'BACKSPACE') {
            return '⌫';
        } else if (keyCodeName === 'TAB') {
            return '⇥';
        } else if (keyCodeName === 'ENTER') {
            return '⏎';
        } else if (keyCodeName === 'SHIFT') {
            return '⇪';
        } else if (keyCodeName === 'CTRL') {
            return '⌃';
        } else if (keyCodeName === 'ALT') {
            return '⎇';
        } else if (keyCodeName === 'ESCAPE') {
            return 'Esc';
        } else if (keyCodeName === 'SPACE') {
            return '_';
        } else if (keyCodeName === 'UP') {
            return '↑';
        } else if (keyCodeName === 'DOWN') {
            return '↓';
        } else if (keyCodeName === 'LEFT') {
            return '←';
        } else if (keyCodeName === 'RIGHT') {
            return '→';
        } else if (keyCodeName.match(/^_\d$/)) {
            return keyCodeName[1]; // convert '_0' to '0', '_9' to '9'
        } else if (keyCodeName === 'SEMICOLON') {
            return ';';
        } else if (keyCodeName === 'EQUALS') {
            return '=';
        } else if (keyCodeName === 'COMMA') {
            return ',';
        } else if (keyCodeName === 'DASH') {
            return '-';
        } else if (keyCodeName === 'PERIOD') {
            return '.';
        } else if (keyCodeName === 'FORWARD_SLASH') {
            return '/';
        } else if (keyCodeName === 'OPEN_BRACKET') {
            return '[';
        } else if (keyCodeName === 'BACK_SLASH') {
            return '\\';
        } else if (keyCodeName === 'CLOSE_BRACKET') {
            return ']';
        } else if (keyCodeName === 'SINGLE_QUOTE') {
            return '\'';
        }
        return keyCodeName;
    };

    class Submenu extends Menu {
        constructor(name) {
            super(name);
        }
        redraw(index) {
            this.isOpen = true; // submenu is always considered open (hidden by its menuItem, not by itself)
            super.redraw(index);

            this.domElement.style.left = ''; // don't override the css left to be at 0

            // hide the title of the dropdown
            let title = this.domElement.querySelector('.desktopMenuBarMenuTitle');
            if (title) {
                title.style.display = 'none';
            }
        }
    }

    class MenuItemSubmenu extends MenuItem {
        constructor(text, options, onClick) {
            super(text, options, onClick);

            this.hasSubmenu = true;

            // add an arrow to signal that this one has a submenu
            let arrow = document.createElement('div');
            arrow.classList.add('desktopMenuBarItemArrow');
            arrow.innerText = '>';
            this.domElement.appendChild(arrow);

            this.buildSubMenu();

            this.domElement.addEventListener('pointerover', () => {
                this.showSubMenu();
            });

            this.domElement.addEventListener('pointerout', () => {
                this.hideSubMenu();
            });
        }
        addItemToSubmenu(menuItem) {
            this.submenu.addItem(menuItem);
        }
        buildSubMenu() {
            // the name of the submenu doesn't matter because it isn't rendered
            this.submenu = new Submenu('Sub Menu');
            this.submenu.redraw()
            this.submenu.domElement.classList.add('desktopMenuBarSubmenu');
            this.domElement.appendChild(this.submenu.domElement);
            this.hideSubMenu();
        }
        showSubMenu() {
            this.submenu.domElement.classList.remove('hiddenDropdown');
            this.submenu.domElement.classList.add('desktopMenuBarSubmenu');
        }
        hideSubMenu() {
            if (!this.submenu.domElement) return;
            if (!this.submenu.domElement.parentElement) return;
            this.submenu.domElement.classList.add('hiddenDropdown');
            this.submenu.domElement.classList.remove('desktopMenuBarSubmenu');
        }
    }

    exports.MenuBar = MenuBar;
    exports.Menu = Menu;
    exports.MenuItem = MenuItem;
    exports.MenuItemSubmenu = MenuItemSubmenu;
})(realityEditor.gui);
