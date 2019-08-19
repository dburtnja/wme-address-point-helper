// ==UserScript==
// @name           WME Address Point Helper
// @author         Andrei Pavlenko
// @version        1.11.1
// @include 	   /^https:\/\/(www|beta)\.waze\.com\/(?!user\/)(.{2,6}\/)?editor.*$/
// @exclude        https://www.waze.com/user/*editor/*
// @exclude        https://www.waze.com/*/user/*editor/*
// @grant          none
// @description    Creates point with same address
// @namespace https://greasyfork.org/users/182795
// @require https://greasyfork.org/scripts/24851-wazewrap/code/WazeWrap.js
// @require https://greasyfork.org/scripts/16071-wme-keyboard-shortcuts/code/WME%20Keyboard%20Shortcuts.js
// ==/UserScript==

var locale;

var settings = {
    addNavigationPoint: false,
    inheritNavigationPoint: false,
    autoSetHNToName: false
};

var translations = {
    'en': {
        createPoint: 'Create point',
        createResidential: 'Create residential',
        addEntryPoint: 'Add entry point',
        inheritEntryPoint: 'Inherit parent\'s landmark entry point',
        copyHNToName: 'Copy house number into name'
    },
    'uk': {
        createPoint: 'Створити точку',
        createResidential: 'Створити АТ',
        addEntryPoint: 'Додавати точку в\'їзду',
        inheritEntryPoint: 'Наслідувати точку в\'їзду батьківського ПОІ',
        copyHNToName: 'Копіювати номер будинку в назву'
    },
    'ru': {
        createPoint: 'Создать точку',
        createResidential: 'Создать АТ',
        addEntryPoint: 'Создавать точку въезда',
        inheritEntryPoint: 'Наследовать точку въезда родительского ПОИ',
        copyHNToName: 'Копировать номер дома в название'
    }
};

var hnValidators = {
    'Ukraine': hn => {
        let valid = false
        try {
            valid = /^\d+[А-ЯЇІЄ]{0,3}$/i.test(hn)
        } catch (e) { /* Do nothing */ }
        return valid;
    },
    'default': hn => {
        return /.+/.test(hn);
    }
};

(function() {
    setTimeout(init, 1000);
})();

function init() {
    try {
        if (
            document.getElementById('sidebarContent') !== null &&
            document.getElementById('user-tabs') !== null && WazeWrap.Ready
        ) {
            initLocale();
            createMutationObserver();
            createScriptTab();
            initSettings();
            registerKeyboardShortcuts();
            subscribeActionManagerEvents();
        } else {
            setTimeout(init, 1000);
            return;
        }
    } catch (err) {
        setTimeout(1000, init);
        return;
    }
}

function createScriptTab() {
    const html = `
    <div id="sidepanel-aph">
        <p>WME Address Point Helper 📍</p>
        <div class="controls-container"><input type="checkbox" id="aph-add-navigation-point"><label for="aph-add-navigation-point">${translate('addEntryPoint')}</label></div>
        <div class="controls-container"><input type="checkbox" id="aph-inherit-navigation-point"><label for="aph-inherit-navigation-point">${translate('inheritEntryPoint')}</label></div>
        <div class="controls-container"><input type="checkbox" id="aph-set-name"><label for="aph-set-name">${translate('copyHNToName')}</label></div>
    </div>
    `;

    new WazeWrap.Interface.Tab('APH📍', html);
    var APHAddNavigationPoint = $('#aph-add-navigation-point');
    var APHInheritNavigationPoint = $('#aph-inherit-navigation-point');
    var APHSetName = $('#aph-set-name');
    APHAddNavigationPoint.change(() => {
        settings.addNavigationPoint = APHAddNavigationPoint.prop('checked');
    });
    APHInheritNavigationPoint.change(() => {
        settings.inheritNavigationPoint = APHInheritNavigationPoint.prop('checked');
    });
    APHSetName.change(() => {
        settings.autoSetHNToName = APHSetName.prop('checked');
    });
}

function initSettings() {
    var savedSettings = localStorage.getItem('aph-settings');
    if (savedSettings) {
        settings = JSON.parse(savedSettings);
    }
    setChecked('aph-add-navigation-point', settings.addNavigationPoint);
    setChecked('aph-inherit-navigation-point', settings.inheritNavigationPoint);
    setChecked('aph-set-name', settings.autoSetHNToName);
    window.addEventListener('beforeunload', saveSettings);
}

function initLocale() {
    locale = I18n.currentLocale();
}

function translate(keyword) {
    let translation = translations[locale] || translations['en'];
    return translation[keyword] || translations['en'][keyword] || 'Unknown';
}

function saveSettings() {
    if (localStorage) {
        localStorage.setItem('aph-settings', JSON.stringify(settings));
    }
}

function createMutationObserver() {
    const target = document.getElementById('sidebarContent');
    const observerConfig = {
        childList: true,
        subtree: true
    };
    const observerCallback = function() {
      if (document.querySelector('.aph-btn') === null) insertButtonsIfValidSelection();
    }
    const observer = new MutationObserver(observerCallback);
    observer.observe(target, observerConfig);
}

function insertButtonsIfValidSelection() {
    isValidSelection() && insertButtons();
}

function isValidSelection() {
    if (!W.selectionManager.hasSelectedFeatures()) return false;
    if (W.selectionManager.getSelectedFeatures().length !== 1) return false;
    if (W.selectionManager.getSelectedFeatures()[0].model.type !== 'venue') return false;
    return true;
}

function insertButtons() {
    var buttons = `
        <div style="margin-top: 8px">
        <div class="btn-toolbar">
        <input type="button" id="aph-create-point" class="aph-btn btn btn-default" value="${translate('createPoint')}">
        <input type="button" id="aph-create-residential" class="aph-btn btn btn-default" value="${translate('createResidential')}">
        </div>
        </div>
    `;

    $('#landmark-edit-general .address-edit').append(buttons);
    $('#aph-create-point').click(createPoint);
    $('#aph-create-residential').click(createResidential);

    const valid = validateSelectedPoiHN();
    if (!valid) {
      $('#aph-create-point').prop('disabled', true);
      $('#aph-create-residential').prop('disabled', true);
    }
}

function validateSelectedPoiHN() {
    let country = W.model.getTopCountry().name;
    let validator = hnValidators[country] || hnValidators['default'];
    let selectedPoiHN = getSelectedLandmarkAddress().attributes.houseNumber;
    return validator(selectedPoiHN);
}

function createResidential() {
    isValidSelection() && createPoint({isResidential: true});
}

function createPoint({isResidential = false} = {}) {
    if (!isValidSelection()) return;
    var LandmarkFeature = require('Waze/Feature/Vector/Landmark');
    var AddLandmarkAction = require('Waze/Action/AddLandmark');
    var UpdateFeatureAddressAction = require('Waze/Action/UpdateFeatureAddress');
    var NewPoint = new LandmarkFeature();
    var { lat, lon } = getPointCoordinates();
    var address = getSelectedLandmarkAddress();
    var lockRank = getPointLockRank();
    var pointGeometry = new OL.Geometry.Point(lon, lat);

    NewPoint.geometry = pointGeometry;
    NewPoint.attributes.categories.push('OTHER');
    NewPoint.attributes.lockRank = lockRank;
    NewPoint.attributes.residential = isResidential;

    if (settings.addNavigationPoint) {
        var entryPoint, parentEntryPoint = W.selectionManager.getSelectedFeatures()[0].model.attributes.entryExitPoints[0];
        if (settings.inheritNavigationPoint && parentEntryPoint !== undefined) {
            entryPoint = new NavigationPoint(parentEntryPoint.getPoint());
        } else {
            entryPoint = new NavigationPoint(pointGeometry.clone());
        }
        NewPoint.attributes.entryExitPoints.push(entryPoint);
    }

    if (!!address.attributes.houseNumber) {
        NewPoint.attributes.name = address.attributes.houseNumber;
        NewPoint.attributes.houseNumber = address.attributes.houseNumber;
    }

    var newAddressAttributes = {
        streetName: address.getStreetName(),
        emptyStreet: false,
        cityName: address.getCityName(),
        emptyCity: false,
        stateID: address.getState().getID(),
        countryID: address.getCountry().getID(),
    };

    W.selectionManager.unselectAll();
    var addedLandmark = new AddLandmarkAction(NewPoint);
    W.model.actionManager.add(addedLandmark);
    W.model.actionManager.add(new UpdateFeatureAddressAction(NewPoint, newAddressAttributes));
    W.selectionManager.setSelectedModels([addedLandmark.landmark]);
}

// Высчитываем координаты центра выбраного лэндмарка
function getPointCoordinates() {
    const selectedLandmarkGeometry = W.selectionManager.getSelectedFeatures()[0].geometry;

    var coords;
    if (/polygon/i.test(selectedLandmarkGeometry.id)) {
        var polygonCenteroid = selectedLandmarkGeometry.components[0].getCentroid();
        var geometryComponents = selectedLandmarkGeometry.components[0].components;
        var flatComponentsCoords = [];
        geometryComponents.forEach(c => flatComponentsCoords.push(c.x, c.y));
        var interiorPoint = getInteriorPointOfArray(
            flatComponentsCoords,
            2, [polygonCenteroid.x, polygonCenteroid.y]
        );

        coords = {
            lon: interiorPoint[0],
            lat: interiorPoint[1]
        };
    } else {
        coords = {
            lon: selectedLandmarkGeometry.x,
            lat: selectedLandmarkGeometry.y
        };
    }

    coords = addRandomOffsetToCoords(coords);
    return coords;
}

function addRandomOffsetToCoords(coords) {
    var { lat, lon } = coords;
    lat += Math.random() * 2 + 1;
    lon += Math.random() * 2 + 1;
    return { lat, lon };
}

function getSelectedLandmarkAddress() {
    const selectedLandmark = W.selectionManager.getSelectedFeatures()[0];
    const address = selectedLandmark.model.getAddress();
    return address;
}

function getPointLockRank() {
    const selectedLandmark = W.selectionManager.getSelectedFeatures()[0];
    const userRank = W.loginManager.user.rank;
    const parentFeatureLockRank = selectedLandmark.model.getLockRank();

    if (userRank >= parentFeatureLockRank) {
        return parentFeatureLockRank;
    } else if (userRank >= 1) {
        return 1;
    } else {
        return 0;
    }
}

function setChecked(checkboxId, checked) {
    $('#' + checkboxId).prop('checked', checked);
}

function registerKeyboardShortcuts() {
    const scriptName = 'AddressPointHelper';

    WMEKSRegisterKeyboardShortcut(scriptName, 'Address Point Helper', 'APHCreatePoint', translate('createPoint'), createPoint, '-1');
    WMEKSRegisterKeyboardShortcut(scriptName, 'Address Point Helper', 'APHCreateResidential', translate('createResidential'), createResidential, '-1');
    WMEKSLoadKeyboardShortcuts(scriptName);

    window.addEventListener('beforeunload', function() {
        WMEKSSaveKeyboardShortcuts(scriptName);
    }, false);
}

function subscribeActionManagerEvents() {
    let UpdateObjectAction = require("Waze/Action/UpdateObject")

    W.model.actionManager.events.register("afteraction", null, action => {
        // Задаем номер дома в название, если нужно. Пока не нашел более лаконичного способа определить что
        // произошло именно изменение адреса. Можно тестить регуляркой поле _description, но будут проблемы с
        // нюансами содержания этого поля на разных языках
        if (settings.autoSetHNToName) {
            try {
                let subAction = action.action.subActions[0];
                let houseNumber = subAction.attributes.houseNumber;
                let feature = subAction.feature;
                if (feature.attributes.categories.includes('OTHER') && feature.attributes.name === "") {
                    W.model.actionManager.add(new UpdateObjectAction(feature, { name: houseNumber }));
                }
            } catch (e) { /* Do nothing */ }
        }
    });
}

/*
* https://github.com/openlayers/openlayers
*/
function getInteriorPointOfArray(flatCoordinates, stride, flatCenters) {
    let offset = 0;
    let flatCentersOffset = 0;
    let ends = [flatCoordinates.length];
    let i, ii, x, x1, x2, y1, y2;
    const y = flatCenters[flatCentersOffset + 1];
    const intersections = [];
    // Calculate intersections with the horizontal line
    for (let r = 0, rr = ends.length; r < rr; ++r) {
        const end = ends[r];
        x1 = flatCoordinates[end - stride];
        y1 = flatCoordinates[end - stride + 1];
        for (i = offset; i < end; i += stride) {
            x2 = flatCoordinates[i];
            y2 = flatCoordinates[i + 1];
            if ((y <= y1 && y2 <= y) || (y1 <= y && y <= y2)) {
                x = (y - y1) / (y2 - y1) * (x2 - x1) + x1;
                intersections.push(x);
            }
            x1 = x2;
            y1 = y2;
        }
    }
    // Find the longest segment of the horizontal line that has its center point
    // inside the linear ring.
    let pointX = NaN;
    let maxSegmentLength = -Infinity;
    intersections.sort(numberSafeCompareFunction);
    x1 = intersections[0];
    for (i = 1, ii = intersections.length; i < ii; ++i) {
        x2 = intersections[i];
        const segmentLength = Math.abs(x2 - x1);
        if (segmentLength > maxSegmentLength) {
            x = (x1 + x2) / 2;
            if (linearRingsContainsXY(flatCoordinates, offset, ends, stride, x, y)) {
                pointX = x;
                maxSegmentLength = segmentLength;
            }
        }
        x1 = x2;
    }
    if (isNaN(pointX)) {
        // There is no horizontal line that has its center point inside the linear
        // ring.  Use the center of the the linear ring's extent.
        pointX = flatCenters[flatCentersOffset];
    }

    return [pointX, y, maxSegmentLength];
}

function numberSafeCompareFunction(a, b) {
    return a > b ? 1 : a < b ? -1 : 0;
}

function linearRingContainsXY(flatCoordinates, offset, end, stride, x, y) {
    // http://geomalgorithms.com/a03-_inclusion.html
    // Copyright 2000 softSurfer, 2012 Dan Sunday
    // This code may be freely used and modified for any purpose
    // providing that this copyright notice is included with it.
    // SoftSurfer makes no warranty for this code, and cannot be held
    // liable for any real or imagined damage resulting from its use.
    // Users of this code must verify correctness for their application.
    let wn = 0;
    let x1 = flatCoordinates[end - stride];
    let y1 = flatCoordinates[end - stride + 1];
    for (; offset < end; offset += stride) {
      const x2 = flatCoordinates[offset];
      const y2 = flatCoordinates[offset + 1];
      if (y1 <= y) {
        if (y2 > y && ((x2 - x1) * (y - y1)) - ((x - x1) * (y2 - y1)) > 0) {
          wn++;
        }
      } else if (y2 <= y && ((x2 - x1) * (y - y1)) - ((x - x1) * (y2 - y1)) < 0) {
        wn--;
      }
      x1 = x2;
      y1 = y2;
    }
    return wn !== 0;
}

function linearRingsContainsXY(flatCoordinates, offset, ends, stride, x, y) {
    if (ends.length === 0) {
      return false;
    }
    if (!linearRingContainsXY(flatCoordinates, offset, ends[0], stride, x, y)) {
      return false;
    }
    for (let i = 1, ii = ends.length; i < ii; ++i) {
      if (linearRingContainsXY(flatCoordinates, ends[i - 1], ends[i], stride, x, y)) {
        return false;
      }
    }
    return true;
}
/* **************************************** */

var _createClass=function(){function a(b,c){for(var f,d=0;d<c.length;d++)f=c[d],f.enumerable=f.enumerable||!1,f.configurable=!0,"value"in f&&(f.writable=!0),Object.defineProperty(b,f.key,f)}return function(b,c,d){return c&&a(b.prototype,c),d&&a(b,d),b}}();function _classCallCheck(a,b){if(!(a instanceof b))throw new TypeError("Cannot call a class as a function")}var NavigationPoint=function(){function a(b){_classCallCheck(this,a),this._point=b.clone(),this._entry=!0,this._exit=!0,this._isPrimary=!0,this._name=""}return _createClass(a,[{key:"with",value:function _with(){var b=0<arguments.length&&void 0!==arguments[0]?arguments[0]:{};return null==b.point&&(b.point=this.toJSON().point),new this.constructor((this.toJSON().point,b.point))}},{key:"getPoint",value:function getPoint(){return this._point.clone()}},{key:"getEntry",value:function getEntry(){return this._entry}},{key:"getExit",value:function getExit(){return this._exit}},{key:"getName",value:function getName(){return this._name}},{key:"isPrimary",value:function isPrimary(){return this._isPrimary}},{key:"toJSON",value:function toJSON(){return{point:this._point,entry:this._entry,exit:this._exit,primary:this._isPrimary,name:this._name}}},{key:"clone",value:function clone(){return this.with()}}]),a}();
