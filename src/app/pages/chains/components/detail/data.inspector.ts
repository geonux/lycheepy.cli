/*
*  Copyright (C) 1998-2017 by Northwoods Software Corporation. All Rights Reserved.
*/

import * as go from 'gojs';

/**
 This class implements an inspector for GoJS model data objects.
 The constructor takes three arguments:
 {string} divId a string referencing the HTML ID of the to-be inspector's div.
 {Diagram} diagram a reference to a GoJS Diagram.
 {Object} options An optional JS Object describing options for the inspector.

 Options:
 inspectSelection {boolean} Default true, whether to automatically show and populate the Inspector
 with the currently selected Diagram Part. If set to false, the inspector won't show anything
 until you call Inspector.inspectObject(object) with a Part or JavaScript object as the argument.
 includesOwnProperties {boolean} Default true, whether to list all properties currently on the inspected data object.
 properties {Object} An object of string:Object pairs representing propertyName:propertyOptions.
 Can be used to include or exclude additional properties.
 propertyModified function(propertyName, newValue) a callback

 Options for properties:
 show: {boolean|function} a boolean value to show or hide the property from the inspector,
  or a predicate function to show conditionally.
 readOnly: {boolean|function} whether or not the property is read-only
 type: {string} a string describing the data type. Supported values:
  'string|number|boolean|color|arrayofnumber|point|rect|size|spot|margin'
 defaultValue: {*} a default value for the property. Defaults to the empty string.

 Example usage of Inspector:

 var inspector = new Inspector('myInspector', myDiagram,
 {
   includesOwnProperties: false,
   properties: {
     'key': { readOnly: true, show: Inspector.showIfPresent },
     'comments': { show: Inspector.showIfNode  },
     'LinkComments': { show: Inspector.showIfLink },
   }
 });

 This is the basic HTML Structure that the Inspector creates within the given DIV element:

 <div id='divid' class='inspector'>
 <tr>
 <td>propertyName</td>
 <td><input value=propertyValue /></td>
 </tr>
 ...
 </div>

 */
export class Inspector {
  divid: string;
  diagram: go.Diagram;
  options: Object;
  private _div: HTMLElement;
  private _diagram: go.Diagram;
  private _inspectedProperties = {};

  // Either a GoJS Part or a simple data object, such as Model.modelData
  private inspectedObject: Object = null;

  // Inspector options defaults:
  private includesOwnProperties: boolean = true;
  private declaredProperties = {};
  private inspectsSelection = true;
  private propertyModified: any = null;

  private tabIndex: number;

  constructor(divid: string, diagram: go.Diagram, options: Object) {
    this.divid = divid;
    this.diagram = diagram;
    this.options = options;
    const mainDiv = document.getElementById(divid);
    mainDiv.className = 'inspector';
    mainDiv.innerHTML = '';
    this._div = mainDiv;
    this._diagram = diagram;
    if (options !== undefined) {
      if ((<any>options)['includesOwnProperties'] !== undefined) {
        this.includesOwnProperties = (<any>options)['includesOwnProperties'];
      }
      if ((<any>options)['properties'] !== undefined) {
        this.declaredProperties = (<any>options)['properties'];
      }
      if ((<any>options)['inspectSelection'] !== undefined) {
        this.inspectsSelection = (<any>options)['inspectSelection'];
      }
      if ((<any>options)['propertyModified'] !== undefined) {
        this.propertyModified = (<any>options)['propertyModified'];
      }
    }
    const self = this;
    this.diagram.addModelChangedListener( (e) => {
      if (e.isTransactionFinished) {
        self.inspectObject();
      }
    });
    if (this.inspectsSelection) {
      this.diagram.addDiagramListener('ChangedSelection', (e) => { self.inspectObject(); });
    }
  }

  // Some static predicates to use with the 'show' property.
  showIfNode(part?: go.Part) { return part instanceof go.Node; }
  showIfLink(part?: go.Part) { return part instanceof go.Link; }
  showIfGroup(part?: go.Part) { return part instanceof go.Group; }

  // Only show the property if its present. Useful for 'key' which will be shown on Nodes and Groups,
  // but normally not on Links
  showIfPresent(data?: go.Part, propname?: string) {
    if (data instanceof go.Part) {
      data = data.data;
    }
    return typeof data === 'object' && (<any>data)[propname] !== undefined;
  }

  /**
   * Update the HTML state of this Inspector given the properties of the {@link #inspectedObject}.
   * @param {Object} object is an optional argument, used when {@link #inspectSelection} is false to
   *                        set {@link #inspectedObject} and show and edit that object's properties.
   */
  inspectObject(object?: Object) {
    let inspectedObject = object;
    if (inspectedObject === undefined) {
      if (this.inspectsSelection) {
        inspectedObject = this._diagram.selection.first();
      } else {
        inspectedObject = this.inspectedObject;
      }
    }

    if (inspectedObject === null || this.inspectedObject === inspectedObject) {
      this.inspectedObject = inspectedObject;
      this.updateAllHTML();
      return;
    }
    this.inspectedObject = inspectedObject;
    if (this.inspectObject === null) {
      return;
    }
    const mainDiv = this._div;
    mainDiv.innerHTML = '';


    // use either the Part.data or the object itself (for model.modelData)
    const data = (inspectedObject instanceof go.Part) ? inspectedObject.data : inspectedObject;
    if (!data) {
      return;
    }

    // Build table:
    const table = document.createElement('table');
    const tbody = document.createElement('tbody');
    this._inspectedProperties = {};
    this.tabIndex = 0;
    const declaredProperties = this.declaredProperties;

    // Go through all the properties passed in to the inspector and show them, if appropriate:
    for (const k in declaredProperties) {
      if (declaredProperties.hasOwnProperty(k)) {
        const val = (<any>declaredProperties)[k];
        if (!this.canShowProperty(k, val, inspectedObject)) {
          continue;
        }
        let defaultValue = '';
        if (val.defaultValue !== undefined) {
          defaultValue = val.defaultValue;
        }
        if (data[k] !== undefined) {
          defaultValue = data[k];
        }
        tbody.appendChild(this.buildPropertyRow(k, defaultValue || ''));
      }
    }

    // Go through all the properties on the model data and show them, if appropriate:
    if (this.includesOwnProperties) {
      for (const k in data) {
        if (k === '__gohashid') {
          continue;
        } // skip internal GoJS hash property
        if ((<any>this._inspectedProperties)[k]) {
          continue;
        } // already exists
        if ((<any>declaredProperties)[k] && !this.canShowProperty(k, (<any>declaredProperties)[k], inspectedObject)) {
          continue;
        }
        tbody.appendChild(this.buildPropertyRow(k, data[k]));
      }
    }

    table.appendChild(tbody);
    mainDiv.appendChild(table);
  }

  /**
   * @ignore
   * This predicate should be false if the given property should not be shown.
   * Normally it only checks the value of 'show' on the property descriptor.
   * The default value is true.
   * @param {string} propertyName the property name
   * @param {Object} propertyDesc the property descriptor
   * @param {Object} inspectedObject the data object
   * @return {boolean} whether a particular property should be shown in this Inspector
   */
  canShowProperty(propertyName: string, propertyDesc: any, inspectedObject: Object): boolean {
    if (propertyDesc.show === false) {
      return false;
    }
    // if 'show' is a predicate, make sure it passes or do not show this property
    if (typeof propertyDesc.show === 'function') {
      return propertyDesc.show(inspectedObject, propertyName);
    }
    return true;
  }

  /**
   * @ignore
   * This predicate should be false if the given property should not be editable by the user.
   * Normally it only checks the value of 'readOnly' on the property descriptor.
   * The default value is true.
   * @param {string} propertyName the property name
   * @param {Object} propertyDesc the property descriptor
   * @param {Object} inspectedObject the data object
   * @return {boolean} whether a particular property should be shown in this Inspector
   */
  canEditProperty(propertyName: string, propertyDesc: any, inspectedObject: Object): boolean {
    // assume property values that are functions of Objects cannot be edited
    const data = (inspectedObject instanceof go.Part) ? inspectedObject.data : inspectedObject;
    const valtype = typeof data[propertyName];
    if (valtype === 'function') {
      return false;
    }
    if (propertyDesc) {
      if (propertyDesc.readOnly === true) {
        return false;
      }
      // if 'readOnly' is a predicate, make sure it passes or do not show this property
      if (typeof propertyDesc.readOnly === 'function') {
        return !propertyDesc.readOnly(inspectedObject, propertyName);
      }
    }
    return true;
  }

  /**
   * @ignore
   * This sets this._inspectedProperties[propertyName] and creates the HTML table row:
   *    <tr>
   *      <td>propertyName</td>
   *      <td><input value=propertyValue /></td>
   *    </tr>
   * @param {string} propertyName the property name
   * @param {*} propertyValue the property value
   * @return the table row
   */
  buildPropertyRow(propertyName: string, propertyValue: any): HTMLTableRowElement {
    const mainDiv = this._div;
    const tr = document.createElement('tr');

    const td1 = document.createElement('td');
    td1.textContent = propertyName;
    tr.appendChild(td1);

    const td2 = document.createElement('td');
    const input = document.createElement('input');

    input.className = 'form-control';

    const decProp = (<any>this.declaredProperties)[propertyName];
    input.tabIndex = this.tabIndex++;

    const self = this;
    function setprops() { self.updateAllProperties(); }

    input.value = this.convertToString(propertyValue);
    input.disabled = !this.canEditProperty(propertyName, decProp, this.inspectedObject);
    if (decProp) {
      const t = decProp.type;
      if (t !== 'string' && t !== 'number' && t !== 'boolean' &&
        t !== 'arrayofnumber' && t !== 'point' && t !== 'size' &&
        t !== 'rect' && t !== 'spot' && t !== 'margin') {
        input.setAttribute('type', decProp.type);
      }
      if (decProp.type === 'color') {
        if (input.type === 'color') {
          input.addEventListener('input', setprops);
          input.addEventListener('change', setprops);
          input.value = this.convertToColor(propertyValue);
        }
      }
    }

    if (this._diagram.model.isReadOnly) {
      input.disabled = true;
    }

    if (input.type !== 'color') {
      input.addEventListener('blur', setprops);
    }

    td2.appendChild(input);
    tr.appendChild(td2);

    (<any>this._inspectedProperties)[propertyName] = input;
    return tr;
  }

  /**
   * @ignore
   * HTML5 color input will only take hex,
   * so let HTML5 canvas convert the color into hex format.
   * This converts 'rgb(255, 0, 0)' into '#FF0000', etc.
   * @param {string} propertyValue
   * @return {string}
   */
  convertToColor(propertyValue: string): string {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = propertyValue;
    return ctx.fillStyle;
  }

  /**
   * @ignore
   * @param {string}
   * @return {Array.<number>}
   */
  convertToArrayOfNumber(propertyValue: string): Array<number> {
    if (propertyValue === 'null') {
      return null;
    }
    const split = propertyValue.split(' ');
    const arr = [];
    for (let i = 0; i < split.length; i++) {
      const str = split[i];
      if (!str) {
        continue;
      }
      arr.push(parseFloat(str));
    }
    return arr;
  }

  /**
   * @ignore
   * @param {*}
   * @return {string}
   */
  convertToString(x: any): string {
    if (x === undefined) {
      return 'undefined';
    }
    if (x === null) {
      return 'null';
    }
    if (x instanceof go.Point) {
      return go.Point.stringify(x);
    }
    if (x instanceof go.Size) {
      return go.Size.stringify(x);
    }
    if (x instanceof go.Rect) {
      return go.Rect.stringify(x);
    }
    if (x instanceof go.Spot) {
      return go.Spot.stringify(x);
    }
    if (x instanceof go.Margin) {
      return go.Margin.stringify(x);
    }
    if (x instanceof go.List) {
      return this.convertToString(x.toArray());
    }
    if (Array.isArray(x)) {
      let str = '';
      for (let i = 0; i < x.length; i++) {
        if (i > 0) {
          str += ' ';
        }
        const v = x[i];
        str += this.convertToString(v);
      }
      return str;
    }
    return x.toString();
  }

  /**
   * @ignore
   * Update all of the HTML in this Inspector.
   */
  updateAllHTML() {
    const inspectedProps = this._inspectedProperties;
    const diagram = this._diagram;
    const isPart = this.inspectedObject instanceof go.Part;
    const data = isPart ? (<any>this.inspectedObject).data : this.inspectedObject;
    if (!data) {  // clear out all of the fields
      for (const name in inspectedProps) {
        if (inspectedProps.hasOwnProperty(name)) {
          const input = (<any>inspectedProps)[name];
          if (input.type === 'color') {
            input.value = '#000000';
          } else {
            input.value = '';
          }
        }
      }
    } else {
      for (const name in inspectedProps) {
        if (inspectedProps.hasOwnProperty(name)) {
          const input = (<any>inspectedProps)[name];
          const propertyValue = data[name];
          if (input.type === 'color') {
            input.value = this.convertToColor(propertyValue);
          } else {
            input.value = this.convertToString(propertyValue);
          }
        }
      }
    }
  }
  /**
   * @ignore
   * Update all of the data properties of {@link #inspectedObject} according to the
   * current values held in the HTML input elements.
   */
  updateAllProperties() {
    const inspectedProps = this._inspectedProperties;
    const diagram = this._diagram;
    const isPart = this.inspectedObject instanceof go.Part;
    const data = isPart ? (<any>this.inspectedObject).data : this.inspectedObject;
    if (!data) {
      return;
    } // must not try to update data when there's no data!

    diagram.startTransaction('set all properties');
    for (const name in inspectedProps) {
      if (inspectedProps.hasOwnProperty(name)) {
        let value = (<any>inspectedProps)[name].value;

        // don't update 'readOnly' data properties
        const decProp = (<any>this.declaredProperties)[name];
        if (!this.canEditProperty(name, decProp, this.inspectedObject)) {
          continue;
        }

        // If it's a boolean, or if its previous value was boolean,
        // parse the value to be a boolean and then update the input.value to match
        let type = '';
        if (decProp !== undefined && decProp.type !== undefined) {
          type = decProp.type;
        }
        if (type === '') {
          const oldval = data[name];
          if (typeof oldval === 'boolean') {
            type = 'boolean'; // infer boolean
          } else if (typeof oldval === 'number') {
            type = 'number';
          } else if (oldval instanceof go.Point) {
            type = 'point';
          } else if (oldval instanceof go.Size) {
            type = 'size';
          } else if (oldval instanceof go.Rect) {
            type = 'rect';
          } else if (oldval instanceof go.Spot) {
            type = 'spot';
          } else if (oldval instanceof go.Margin) {
            type = 'margin';
          }
        }

        // convert to specific type, if needed
        switch (type) {
          case 'boolean':
            value = !(value === false || value === 'false' || value === '0');
            break;
          case 'number': value = parseFloat(value); break;
          case 'arrayofnumber': value = this.convertToArrayOfNumber(value); break;
          case 'point': value = go.Point.parse(value); break;
          case 'size': value = go.Size.parse(value); break;
          case 'rect': value = go.Rect.parse(value); break;
          case 'spot': value = go.Spot.parse(value); break;
          case 'margin': value = go.Margin.parse(value); break;
        }

        // in case parsed to be different, such as in the case of boolean values,
        // the value shown should match the actual value
        (<any>inspectedProps)[name].value = value;

        // modify the data object in an undo-able fashion
        diagram.model.setDataProperty(data, name, value);

        // notify any listener
        if (this.propertyModified !== null) {
          this.propertyModified(name, value);
        }
      }
    }
    diagram.commitTransaction('set all properties');
  }
}