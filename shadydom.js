(function () {
  'use strict';

  /**
  @license
  Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
  This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
  The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
  The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
  Code distributed by Google as part of the polymer project is also
  subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
  */


  class ShadyData {
    constructor() {
      /** @type {ShadowRoot} */
      this.root = null;
      /** @type {ShadowRoot} */
      this.publicRoot = null;
      this.dirty = false;
      this.observer = null;
      /** @type {Array<Node>} */
      this.assignedNodes = null;
      /** @type {Element} */
      this.assignedSlot = null;
      /** @type {Array<Node>} */
      this._previouslyAssignedNodes = null;
      /** @type {Element} */
      this._prevAssignedSlot = null;
      /** @type {Array<Node>} */
      this.flattenedNodes = null;
      this.ownerShadyRoot = undefined;
      /** @type {Node|undefined} */
      this.parentNode = undefined;
      /** @type {Node|undefined} */
      this.firstChild = undefined;
      /** @type {Node|undefined} */
      this.lastChild = undefined;
      /** @type {Node|undefined} */
      this.previousSibling = undefined;
      /** @type {Node|undefined} */
      this.nextSibling = undefined;
      /** @type {Array<Node>|undefined} */
      this.childNodes = undefined;
      this.__outsideAccessors = false;
      this.__insideAccessors = false;
      this.__onCallbackListeners = {};
    }

    toJSON() {
      return {};
    }
  }

  function ensureShadyDataForNode(node) {
    if (!node.__shady) {
      node.__shady = new ShadyData();
    }
    return node.__shady;
  }

  function shadyDataForNode(node) {
    return node && node.__shady;
  }

  /**
  @license
  Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
  This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
  The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
  The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
  Code distributed by Google as part of the polymer project is also
  subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
  */

  let settings = window['ShadyDOM'] || {};

  settings.hasNativeShadowDOM = Boolean(Element.prototype.attachShadow && Node.prototype.getRootNode);

  let desc = Object.getOwnPropertyDescriptor(Node.prototype, 'firstChild');

  settings.hasDescriptors = Boolean(desc && desc.configurable && desc.get);
  settings.inUse = settings['force'] || !settings.hasNativeShadowDOM;

  // Default to using native accessors (instead of treewalker) only for
  // IE/Edge where they are faster.
  const IS_IE = navigator.userAgent.match('Trident');
  const IS_EDGE = navigator.userAgent.match('Edge');
  if (settings.useNativeAccessors === undefined) {
    settings.useNativeAccessors = settings.hasDescriptors && (IS_IE || IS_EDGE);
  }

  function isTrackingLogicalChildNodes(node) {
    const nodeData = shadyDataForNode(node);
    return (nodeData && nodeData.firstChild !== undefined);
  }

  function isShadyRoot(obj) {
    return Boolean(obj._localName === 'ShadyRoot');
  }

  function ownerShadyRootForNode(node) {
    let root = node.getRootNode();
    if (isShadyRoot(root)) {
      return root;
    }
  }

  let p = Element.prototype;
  let matches = p.matches || p.matchesSelector ||
    p.mozMatchesSelector || p.msMatchesSelector ||
    p.oMatchesSelector || p.webkitMatchesSelector;

  function matchesSelector(element, selector) {
    return matches.call(element, selector);
  }

  function copyOwnProperty(name, source, target) {
    let pd = Object.getOwnPropertyDescriptor(source, name);
    if (pd) {
      Object.defineProperty(target, name, pd);
    }
  }

  function extend(target, source) {
    if (target && source) {
      let n$ = Object.getOwnPropertyNames(source);
      for (let i=0, n; (i<n$.length) && (n=n$[i]); i++) {
        copyOwnProperty(n, source, target);
      }
    }
    return target || source;
  }

  function extendAll(target, ...sources) {
    for (let i=0; i < sources.length; i++) {
      extend(target, sources[i]);
    }
    return target;
  }

  function mixin(target, source) {
    for (var i in source) {
      target[i] = source[i];
    }
    return target;
  }

  function patchPrototype(obj, mixin) {
    let proto = Object.getPrototypeOf(obj);
    if (!proto.hasOwnProperty('__patchProto')) {
      let patchProto = Object.create(proto);
      patchProto.__sourceProto = proto;
      extend(patchProto, mixin);
      proto['__patchProto'] = patchProto;
    }
    // old browsers don't have setPrototypeOf
    obj.__proto__ = proto['__patchProto'];
  }


  let twiddle = document.createTextNode('');
  let content = 0;
  let queue = [];
  new MutationObserver(() => {
    while (queue.length) {
      // catch errors in user code...
      try {
        queue.shift()();
      } catch(e) {
        // enqueue another record and throw
        twiddle.textContent = content++;
        throw(e);
      }
    }
  }).observe(twiddle, {characterData: true});

  // use MutationObserver to get microtask async timing.
  function microtask(callback) {
    queue.push(callback);
    twiddle.textContent = content++;
  }

  const hasDocumentContains = Boolean(document.contains);

  function contains(container, node) {
    while (node) {
      if (node == container) {
        return true;
      }
      node = node.parentNode;
    }
    return false;
  }

  function getNodeHTMLCollectionName(node) {
    return node.getAttribute('id') || node.getAttribute('name');
  }

  function isValidHTMLCollectionName(name) {
    return name !== 'length' && isNaN(name);
  }

  function createPolyfilledHTMLCollection(nodes) {
    // Note: loop in reverse so that the first named item matches the named property
    for (let l = nodes.length - 1; l >= 0; l--) {
      const node = nodes[l];
      const name = getNodeHTMLCollectionName(node);

      if (name && isValidHTMLCollectionName(name)) {
        nodes[name] = node;
      }
    }
    nodes.item = function(index) {
      return nodes[index];
    };
    nodes.namedItem = function(name) {
      if (isValidHTMLCollectionName(name) && nodes[name]) {
        return nodes[name];
      }

      for (const node of nodes) {
        const nodeName = getNodeHTMLCollectionName(node);

        if (nodeName == name) {
          return node;
        }
      }

      return null;
    };
    return nodes;
  }

  /**
  @license
  Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
  This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
  The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
  The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
  Code distributed by Google as part of the polymer project is also
  subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
  */

  // render enqueuer/flusher
  let flushList = [];
  let scheduled;
  function enqueue(callback) {
    if (!scheduled) {
      scheduled = true;
      microtask(flush);
    }
    flushList.push(callback);
  }

  function flush() {
    scheduled = false;
    let didFlush = Boolean(flushList.length);
    while (flushList.length) {
      flushList.shift()();
    }
    return didFlush;
  }

  flush['list'] = flushList;

  /**
  @license
  Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
  This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
  The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
  The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
  Code distributed by Google as part of the polymer project is also
  subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
  */

  class AsyncObserver {

    constructor() {
      this._scheduled = false;
      this.addedNodes = [];
      this.removedNodes = [];
      this.callbacks = new Set();
    }

    schedule() {
      if (!this._scheduled) {
        this._scheduled = true;
        microtask(() => {
          this.flush();
        });
      }
    }

    flush() {
      if (this._scheduled) {
        this._scheduled = false;
        let mutations = this.takeRecords();
        if (mutations.length) {
          this.callbacks.forEach(function(cb) {
            cb(mutations);
          });
        }
      }
    }

    takeRecords() {
      if (this.addedNodes.length || this.removedNodes.length) {
        let mutations = [{
          addedNodes: this.addedNodes,
          removedNodes: this.removedNodes
        }];
        this.addedNodes = [];
        this.removedNodes = [];
        return mutations;
      }
      return [];
    }

  }

  // TODO(sorvell): consider instead polyfilling MutationObserver
  // directly so that users do not have to fork their code.
  // Supporting the entire api may be challenging: e.g. filtering out
  // removed nodes in the wrong scope and seeing non-distributing
  // subtree child mutations.
  let observeChildren = function(node, callback) {
    const sd = ensureShadyDataForNode(node);
    if (!sd.observer) {
      sd.observer = new AsyncObserver();
    }
    sd.observer.callbacks.add(callback);
    let observer = sd.observer;
    return {
      _callback: callback,
      _observer: observer,
      _node: node,
      takeRecords() {
        return observer.takeRecords()
      }
    };
  };

  let unobserveChildren = function(handle) {
    let observer = handle && handle._observer;
    if (observer) {
      observer.callbacks.delete(handle._callback);
      if (!observer.callbacks.size) {
        ensureShadyDataForNode(handle._node).observer = null;
      }
    }
  };

  function filterMutations(mutations, target) {
    /** @const {Node} */
    const targetRootNode = target.getRootNode();
    return mutations.map(function(mutation) {
      /** @const {boolean} */
      const mutationInScope = (targetRootNode === mutation.target.getRootNode());
      if (mutationInScope && mutation.addedNodes) {
        let nodes = Array.from(mutation.addedNodes).filter(function(n) {
          return (targetRootNode === n.getRootNode());
        });
        if (nodes.length) {
          mutation = Object.create(mutation);
          Object.defineProperty(mutation, 'addedNodes', {
            value: nodes,
            configurable: true
          });
          return mutation;
        }
      } else if (mutationInScope) {
        return mutation;
      }
    }).filter(function(m) { return m});
  }

  /**
  @license
  Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
  This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
  The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
  The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
  Code distributed by Google as part of the polymer project is also
  subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
  */

  let appendChild = Element.prototype.appendChild;
  let insertBefore = Element.prototype.insertBefore;
  let replaceChild = Element.prototype.replaceChild;
  let removeChild = Element.prototype.removeChild;
  let setAttribute = Element.prototype.setAttribute;
  let removeAttribute = Element.prototype.removeAttribute;
  let cloneNode = Element.prototype.cloneNode;
  let importNode = Document.prototype.importNode;
  let addEventListener = Element.prototype.addEventListener;
  let removeEventListener = Element.prototype.removeEventListener;
  let windowAddEventListener = Window.prototype.addEventListener;
  let windowRemoveEventListener = Window.prototype.removeEventListener;
  let dispatchEvent = Element.prototype.dispatchEvent;
  let contains$1 = Node.prototype.contains || HTMLElement.prototype.contains;
  let getElementById = Document.prototype.getElementById;
  let elementQuerySelector = Element.prototype.querySelector;
  let fragmentQuerySelector = DocumentFragment.prototype.querySelector;
  let documentQuerySelector = Document.prototype.querySelector;
  let querySelector = /** @this {Element|Document|DocumentFragment} */ function(selector) {
    switch (this.nodeType) {
      case Node.ELEMENT_NODE:
        return elementQuerySelector.call(/** @type {Element} */ (this), selector);
      case Node.DOCUMENT_NODE:
        return documentQuerySelector.call(/** @type {Document} */ (this), selector);
      default:
        return fragmentQuerySelector.call(this, selector);
    }
  };
  let elementQuerySelectorAll = Element.prototype.querySelectorAll;
  let fragmentQuerySelectorAll = DocumentFragment.prototype.querySelectorAll;
  let documentQuerySelectorAll = Document.prototype.querySelectorAll;
  let querySelectorAll = /** @this {Element|Document|DocumentFragment} */ function(selector) {
    switch (this.nodeType) {
      case Node.ELEMENT_NODE:
        return elementQuerySelectorAll.call(/** @type {Element} */ (this), selector);
      case Node.DOCUMENT_NODE:
        return documentQuerySelectorAll.call(/** @type {Document} */ (this), selector);
      default:
        return fragmentQuerySelectorAll.call(this, selector);
    }
  };

  var nativeMethods = /*#__PURE__*/Object.freeze({
    appendChild: appendChild,
    insertBefore: insertBefore,
    replaceChild: replaceChild,
    removeChild: removeChild,
    setAttribute: setAttribute,
    removeAttribute: removeAttribute,
    cloneNode: cloneNode,
    importNode: importNode,
    addEventListener: addEventListener,
    removeEventListener: removeEventListener,
    windowAddEventListener: windowAddEventListener,
    windowRemoveEventListener: windowRemoveEventListener,
    dispatchEvent: dispatchEvent,
    contains: contains$1,
    getElementById: getElementById,
    elementQuerySelector: elementQuerySelector,
    fragmentQuerySelector: fragmentQuerySelector,
    documentQuerySelector: documentQuerySelector,
    querySelector: querySelector,
    elementQuerySelectorAll: elementQuerySelectorAll,
    fragmentQuerySelectorAll: fragmentQuerySelectorAll,
    documentQuerySelectorAll: documentQuerySelectorAll,
    querySelectorAll: querySelectorAll
  });

  /**
  @license
  Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
  This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
  The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
  The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
  Code distributed by Google as part of the polymer project is also
  subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
  */

  // Cribbed from ShadowDOM polyfill
  // https://github.com/webcomponents/webcomponentsjs/blob/master/src/ShadowDOM/wrappers/HTMLElement.js#L28
  /////////////////////////////////////////////////////////////////////////////
  // innerHTML and outerHTML

  // http://www.whatwg.org/specs/web-apps/current-work/multipage/the-end.html#escapingString
  let escapeAttrRegExp = /[&\u00A0"]/g;
  let escapeDataRegExp = /[&\u00A0<>]/g;

  function escapeReplace(c) {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case '\u00A0':
        return '&nbsp;';
    }
  }

  function escapeAttr(s) {
    return s.replace(escapeAttrRegExp, escapeReplace);
  }

  function escapeData(s) {
    return s.replace(escapeDataRegExp, escapeReplace);
  }

  function makeSet(arr) {
    let set = {};
    for (let i = 0; i < arr.length; i++) {
      set[arr[i]] = true;
    }
    return set;
  }

  // http://www.whatwg.org/specs/web-apps/current-work/#void-elements
  let voidElements = makeSet([
    'area',
    'base',
    'br',
    'col',
    'command',
    'embed',
    'hr',
    'img',
    'input',
    'keygen',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr'
  ]);

  let plaintextParents = makeSet([
    'style',
    'script',
    'xmp',
    'iframe',
    'noembed',
    'noframes',
    'plaintext',
    'noscript'
  ]);

  /**
   * @param {Node} node
   * @param {Node} parentNode
   * @param {Function=} callback
   */
  function getOuterHTML(node, parentNode, callback) {
    switch (node.nodeType) {
      case Node.ELEMENT_NODE: {
        let tagName = node.localName;
        let s = '<' + tagName;
        let attrs = node.attributes;
        for (let i = 0, attr; (attr = attrs[i]); i++) {
          s += ' ' + attr.name + '="' + escapeAttr(attr.value) + '"';
        }
        s += '>';
        if (voidElements[tagName]) {
          return s;
        }
        return s + getInnerHTML(node, callback) + '</' + tagName + '>';
      }
      case Node.TEXT_NODE: {
        let data = /** @type {Text} */ (node).data;
        if (parentNode && plaintextParents[parentNode.localName]) {
          return data;
        }
        return escapeData(data);
      }
      case Node.COMMENT_NODE: {
        return '<!--' + /** @type {Comment} */ (node).data + '-->';
      }
      default: {
        window.console.error(node);
        throw new Error('not implemented');
      }
    }
  }

  /**
   * @param {Node} node
   * @param {Function=} callback
   */
  function getInnerHTML(node, callback) {
    if (node.localName === 'template') {
      node =  /** @type {HTMLTemplateElement} */ (node).content;
    }
    let s = '';
    let c$ = callback ? callback(node) : node.childNodes;
    for (let i=0, l=c$.length, child; (i<l) && (child=c$[i]); i++) {
      s += getOuterHTML(child, node, callback);
    }
    return s;
  }

  /**
  @license
  Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
  This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
  The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
  The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
  Code distributed by Google as part of the polymer project is also
  subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
  */

  let nodeWalker = document.createTreeWalker(document, NodeFilter.SHOW_ALL,
    null, false);

  let elementWalker = document.createTreeWalker(document, NodeFilter.SHOW_ELEMENT,
    null, false);

  function parentNode(node) {
    nodeWalker.currentNode = node;
    return nodeWalker.parentNode();
  }

  function firstChild(node) {
    nodeWalker.currentNode = node;
    return nodeWalker.firstChild();
  }

  function lastChild(node) {
    nodeWalker.currentNode = node;
    return nodeWalker.lastChild();
  }

  function previousSibling(node) {
    nodeWalker.currentNode = node;
    return nodeWalker.previousSibling();
  }

  function nextSibling(node) {
    nodeWalker.currentNode = node;
    return nodeWalker.nextSibling();
  }

  function childNodes(node) {
    let nodes = [];
    nodeWalker.currentNode = node;
    let n = nodeWalker.firstChild();
    while (n) {
      nodes.push(n);
      n = nodeWalker.nextSibling();
    }
    return nodes;
  }

  function parentElement(node) {
    elementWalker.currentNode = node;
    return elementWalker.parentNode();
  }

  function firstElementChild(node) {
    elementWalker.currentNode = node;
    return elementWalker.firstChild();
  }

  function lastElementChild(node) {
    elementWalker.currentNode = node;
    return elementWalker.lastChild();
  }

  function previousElementSibling(node) {
    elementWalker.currentNode = node;
    return elementWalker.previousSibling();
  }

  function nextElementSibling(node) {
    elementWalker.currentNode = node;
    return elementWalker.nextSibling();
  }

  function children(node) {
    let nodes = [];
    elementWalker.currentNode = node;
    let n = elementWalker.firstChild();
    while (n) {
      nodes.push(n);
      n = elementWalker.nextSibling();
    }
    return createPolyfilledHTMLCollection(nodes);
  }

  function innerHTML(node) {
    return getInnerHTML(node, (n) => childNodes(n));
  }

  function textContent(node) {
    /* eslint-disable no-case-declarations */
    switch (node.nodeType) {
      case Node.ELEMENT_NODE:
      case Node.DOCUMENT_FRAGMENT_NODE:
        let textWalker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT,
          null, false);
        let content = '', n;
        while ( (n = textWalker.nextNode()) ) {
          // TODO(sorvell): can't use textContent since we patch it on Node.prototype!
          // However, should probably patch it only on element.
          content += n.nodeValue;
        }
        return content;
      default:
        return node.nodeValue;
    }
    /* eslint-enable */
  }

  var nativeTreeWalker = /*#__PURE__*/Object.freeze({
    parentNode: parentNode,
    firstChild: firstChild,
    lastChild: lastChild,
    previousSibling: previousSibling,
    nextSibling: nextSibling,
    childNodes: childNodes,
    parentElement: parentElement,
    firstElementChild: firstElementChild,
    lastElementChild: lastElementChild,
    previousElementSibling: previousElementSibling,
    nextElementSibling: nextElementSibling,
    children: children,
    innerHTML: innerHTML,
    textContent: textContent
  });

  /**
  @license
  Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
  This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
  The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
  The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
  Code distributed by Google as part of the polymer project is also
  subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
  */

  const hasDescriptors = settings.hasDescriptors;

  // Find descriptor on the "lowest" native prototype. Safe as these are not
  // overridden and we call these on nodes.
  const nativeProtos = [Node.prototype, Element.prototype, HTMLElement.prototype];
  // note, avoid Array.find for IE11 compat.
  function findNativeProtoWithDescriptor(name) {
    for (let i=0; i < nativeProtos.length; i++) {
      const proto = nativeProtos[i];
      if (proto.hasOwnProperty(name)) {
        return proto;
      }
    }
  }
  function findNodeDescriptor(name) {
    const proto = findNativeProtoWithDescriptor(name);
    if (!proto) {
      throw Error(`Could not find descriptor for ${name}`);
    }
    return Object.getOwnPropertyDescriptor(proto, name);
  }

  const nodeAccessors = hasDescriptors ? {
    parentNode: findNodeDescriptor('parentNode'),
    firstChild: findNodeDescriptor('firstChild'),
    lastChild: findNodeDescriptor('lastChild'),
    previousSibling: findNodeDescriptor('previousSibling'),
    nextSibling: findNodeDescriptor('nextSibling'),
    childNodes: findNodeDescriptor('childNodes'),
    parentElement: findNodeDescriptor('parentElement'),
    previousElementSibling: findNodeDescriptor('previousElementSibling'),
    nextElementSibling: findNodeDescriptor('nextElementSibling'),
    innerHTML: findNodeDescriptor('innerHTML'),
    textContent: findNodeDescriptor('textContent'),
    firstElementChild: findNodeDescriptor('firstElementChild'),
    lastElementChild: findNodeDescriptor('lastElementChild'),
    children: findNodeDescriptor('children'),
  } : {};

  const fragmentAccessors = hasDescriptors ? {
    firstElementChild: Object.getOwnPropertyDescriptor(
      DocumentFragment.prototype, 'firstElementChild'),
    lastElementChild: Object.getOwnPropertyDescriptor(
      DocumentFragment.prototype, 'lastElementChild'),
    children: Object.getOwnPropertyDescriptor(
      DocumentFragment.prototype, 'children')
  } : {};

  const documentAccessors = hasDescriptors ? {
    firstElementChild: Object.getOwnPropertyDescriptor(
      Document.prototype, 'firstElementChild'),
    lastElementChild: Object.getOwnPropertyDescriptor(
      Document.prototype, 'lastElementChild'),
    children: Object.getOwnPropertyDescriptor(
      Document.prototype, 'children')
  } : {};

  function parentNode$1(node) {
    return nodeAccessors.parentNode.get.call(node);
  }

  function firstChild$1(node) {
    return nodeAccessors.firstChild.get.call(node);
  }

  function lastChild$1(node) {
    return nodeAccessors.lastChild.get.call(node);
  }

  function previousSibling$1(node) {
    return nodeAccessors.previousSibling.get.call(node);
  }

  function nextSibling$1(node) {
    return nodeAccessors.nextSibling.get.call(node);
  }

  function childNodes$1(node) {
    return Array.prototype.slice.call(nodeAccessors.childNodes.get.call(node));
  }

  function parentElement$1(node) {
    return nodeAccessors.parentElement.get.call(node);
  }

  function previousElementSibling$1(node) {
    return nodeAccessors.previousElementSibling.get.call(node);
  }

  function nextElementSibling$1(node) {
    return nodeAccessors.nextElementSibling.get.call(node);
  }

  function innerHTML$1(node) {
    return nodeAccessors.innerHTML.get.call(node);
  }

  function textContent$1(node) {
    return nodeAccessors.textContent.get.call(node);
  }

  function children$1(node) {
    switch (node.nodeType) {
      case Node.DOCUMENT_FRAGMENT_NODE:
        return fragmentAccessors.children.get.call(node);
      case Node.DOCUMENT_NODE:
        return documentAccessors.children.get.call(node);
      default:
        return nodeAccessors.children.get.call(node);
    }
  }

  function firstElementChild$1(node) {
    switch (node.nodeType) {
      case Node.DOCUMENT_FRAGMENT_NODE:
        return fragmentAccessors.firstElementChild.get.call(node);
      case Node.DOCUMENT_NODE:
        return documentAccessors.firstElementChild.get.call(node);
      default:
        return nodeAccessors.firstElementChild.get.call(node);
    }
  }

  function lastElementChild$1(node) {
    switch (node.nodeType) {
      case Node.DOCUMENT_FRAGMENT_NODE:
        return fragmentAccessors.lastElementChild.get.call(node);
      case Node.DOCUMENT_NODE:
        return documentAccessors.lastElementChild.get.call(node);
      default:
        return nodeAccessors.lastElementChild.get.call(node);
    }
  }

  var nativeTreeAccessors = /*#__PURE__*/Object.freeze({
    nodeAccessors: nodeAccessors,
    fragmentAccessors: fragmentAccessors,
    documentAccessors: documentAccessors,
    parentNode: parentNode$1,
    firstChild: firstChild$1,
    lastChild: lastChild$1,
    previousSibling: previousSibling$1,
    nextSibling: nextSibling$1,
    childNodes: childNodes$1,
    parentElement: parentElement$1,
    previousElementSibling: previousElementSibling$1,
    nextElementSibling: nextElementSibling$1,
    innerHTML: innerHTML$1,
    textContent: textContent$1,
    children: children$1,
    firstElementChild: firstElementChild$1,
    lastElementChild: lastElementChild$1
  });

  /**
  @license
  Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
  This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
  The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
  The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
  Code distributed by Google as part of the polymer project is also
  subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
  */

  const accessors = settings.useNativeAccessors ?
      nativeTreeAccessors : nativeTreeWalker;

  /**
  @license
  Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
  This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
  The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
  The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
  Code distributed by Google as part of the polymer project is also
  subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
  */

  function clearNode(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  const hasDescriptors$1 = settings.hasDescriptors;
  const inertDoc = document.implementation.createHTMLDocument('inert');

  const nativeIsConnectedAccessors =
  /** @type {ObjectPropertyDescriptor} */(
    Object.getOwnPropertyDescriptor(Node.prototype, 'isConnected')
  );

  const nativeIsConnected = nativeIsConnectedAccessors && nativeIsConnectedAccessors.get;

  const nativeActiveElementDescriptor =
    /** @type {ObjectPropertyDescriptor} */(
      Object.getOwnPropertyDescriptor(Document.prototype, 'activeElement')
    );
  function getDocumentActiveElement() {
    if (nativeActiveElementDescriptor && nativeActiveElementDescriptor.get) {
      return nativeActiveElementDescriptor.get.call(document);
    } else if (!settings.hasDescriptors) {
      return document.activeElement;
    }
  }

  function activeElementForNode(node) {
    let active = getDocumentActiveElement();
    // In IE11, activeElement might be an empty object if the document is
    // contained in an iframe.
    // https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/10998788/
    if (!active || !active.nodeType) {
      return null;
    }
    let isShadyRoot$$1 = !!(isShadyRoot(node));
    if (node !== document) {
      // If this node isn't a document or shady root, then it doesn't have
      // an active element.
      if (!isShadyRoot$$1) {
        return null;
      }
      // If this shady root's host is the active element or the active
      // element is not a descendant of the host (in the composed tree),
      // then it doesn't have an active element.
      if (node.host === active ||
          !contains$1.call(node.host, active)) {
        return null;
      }
    }
    // This node is either the document or a shady root of which the active
    // element is a (composed) descendant of its host; iterate upwards to
    // find the active element's most shallow host within it.
    let activeRoot = ownerShadyRootForNode(active);
    while (activeRoot && activeRoot !== node) {
      active = activeRoot.host;
      activeRoot = ownerShadyRootForNode(active);
    }
    if (node === document) {
      // This node is the document, so activeRoot should be null.
      return activeRoot ? null : active;
    } else {
      // This node is a non-document shady root, and it should be
      // activeRoot.
      return activeRoot === node ? active : null;
    }
  }

  let OutsideAccessors = {

    parentElement: {
      /** @this {Node} */
      get() {
        const nodeData = shadyDataForNode(this);
        let l = nodeData && nodeData.parentNode;
        if (l && l.nodeType !== Node.ELEMENT_NODE) {
          l = null;
        }
        return l !== undefined ? l : accessors.parentElement(this);
      },
      configurable: true
    },

    parentNode: {
      /** @this {Node} */
      get() {
        const nodeData = shadyDataForNode(this);
        const l = nodeData && nodeData.parentNode;
        return l !== undefined ? l : accessors.parentNode(this);
      },
      configurable: true
    },

    nextSibling: {
      /** @this {Node} */
      get() {
        const nodeData = shadyDataForNode(this);
        const l = nodeData && nodeData.nextSibling;
        return l !== undefined ? l : accessors.nextSibling(this);
      },
      configurable: true
    },

    previousSibling: {
      /** @this {Node} */
      get() {
        const nodeData = shadyDataForNode(this);
        const l = nodeData && nodeData.previousSibling;
        return l !== undefined ? l : accessors.previousSibling(this);
      },
      configurable: true
    },

    // fragment, element, document
    nextElementSibling: {
      /**
       * @this {HTMLElement}
       */
      get() {
        const nodeData = shadyDataForNode(this);
        if (nodeData && nodeData.nextSibling !== undefined) {
          let n = this.nextSibling;
          while (n && n.nodeType !== Node.ELEMENT_NODE) {
            n = n.nextSibling;
          }
          return n;
        } else {
          return accessors.nextElementSibling(this);
        }
      },
      configurable: true
    },

    previousElementSibling: {
      /**
       * @this {HTMLElement}
       */
      get() {
        const nodeData = shadyDataForNode(this);
        if (nodeData && nodeData.previousSibling !== undefined) {
          let n = this.previousSibling;
          while (n && n.nodeType !== Node.ELEMENT_NODE) {
            n = n.previousSibling;
          }
          return n;
        } else {
          return accessors.previousElementSibling(this);
        }
      },
      configurable: true
    }

  };

  const ClassNameAccessor = {
    className: {
      /**
       * @this {HTMLElement}
       */
      get() {
        return this.getAttribute('class') || '';
      },
      /**
       * @this {HTMLElement}
       */
      set(value) {
        this.setAttribute('class', value);
      },
      configurable: true
    }
  };

  const IsConnectedAccessor = {

    isConnected: {
      /**
       * @this {Node}
       */
      get() {
        if (nativeIsConnected && nativeIsConnected.call(this)) {
          return true;
        }
        if (this.nodeType == Node.DOCUMENT_FRAGMENT_NODE) {
          return false;
        }
        // Fast path for distributed nodes.
        const ownerDocument = this.ownerDocument;
        if (hasDocumentContains) {
          if (contains$1.call(ownerDocument, this)) {
            return true;
          }
        } else if (ownerDocument.documentElement &&
          contains$1.call(ownerDocument.documentElement, this)) {
          return true;
        }
        // Slow path for non-distributed nodes.
        let node = this;
        while (node && !(node instanceof Document)) {
          node = node.parentNode || (isShadyRoot(node) ? /** @type {ShadowRoot} */(node).host : undefined);
        }
        return !!(node && node instanceof Document);
      },
      configurable: true
    }
  };

  let InsideAccessors = {

    childNodes: {
      /**
       * @this {HTMLElement}
       */
      get() {
        let childNodes;
        if (isTrackingLogicalChildNodes(this)) {
          const nodeData = shadyDataForNode(this);
          if (!nodeData.childNodes) {
            nodeData.childNodes = [];
            for (let n=this.firstChild; n; n=n.nextSibling) {
              nodeData.childNodes.push(n);
            }
          }
          childNodes = nodeData.childNodes;
        } else {
          childNodes = accessors.childNodes(this);
        }
        childNodes.item = function(index) {
          return childNodes[index];
        };
        return childNodes;
      },
      configurable: true
    },

    childElementCount: {
      /** @this {HTMLElement} */
      get() {
        return this.children.length;
      },
      configurable: true
    },

    firstChild: {
      /** @this {HTMLElement} */
      get() {
        const nodeData = shadyDataForNode(this);
        const l = nodeData && nodeData.firstChild;
        return l !== undefined ? l : accessors.firstChild(this);
      },
      configurable: true
    },

    lastChild: {
    /** @this {HTMLElement} */
      get() {
        const nodeData = shadyDataForNode(this);
        const l = nodeData && nodeData.lastChild;
        return l !== undefined ? l : accessors.lastChild(this);
      },
      configurable: true
    },

    textContent: {
      /**
       * @this {HTMLElement}
       */
      get() {
        if (isTrackingLogicalChildNodes(this)) {
          let tc = [];
          for (let i = 0, cn = this.childNodes, c; (c = cn[i]); i++) {
            if (c.nodeType !== Node.COMMENT_NODE) {
              tc.push(c.textContent);
            }
          }
          return tc.join('');
        } else {
          return accessors.textContent(this);
        }
      },
      /**
       * @this {HTMLElement}
       * @param {string} text
       */
      set(text) {
        if (typeof text === 'undefined' || text === null) {
          text = '';
        }
        switch (this.nodeType) {
          case Node.ELEMENT_NODE:
          case Node.DOCUMENT_FRAGMENT_NODE:
            if (!isTrackingLogicalChildNodes(this) && hasDescriptors$1) {
              // may be removing a nested slot but fast path if we know we are not.
              const firstChild = this.firstChild;
              if (firstChild != this.lastChild ||
                (firstChild && firstChild.nodeType != Node.TEXT_NODE)) {
                clearNode(this);
              }
              nodeAccessors.textContent.set.call(this, text);
            } else {
              clearNode(this);
              // Document fragments must have no childnodes if setting a blank string
              if (text.length > 0 || this.nodeType === Node.ELEMENT_NODE) {
                this.appendChild(document.createTextNode(text));
              }
            }
            break;
          default:
            // TODO(sorvell): can't do this if patch nodeValue.
            this.nodeValue = text;
            break;
        }
      },
      configurable: true
    },

    // fragment, element, document
    firstElementChild: {
      /**
       * @this {HTMLElement}
       */
      get() {
        const nodeData = shadyDataForNode(this);
        if (nodeData && nodeData.firstChild !== undefined) {
          let n = this.firstChild;
          while (n && n.nodeType !== Node.ELEMENT_NODE) {
            n = n.nextSibling;
          }
          return n;
        } else {
          return accessors.firstElementChild(this);
        }
      },
      configurable: true
    },

    lastElementChild: {
      /**
       * @this {HTMLElement}
       */
      get() {
        const nodeData = shadyDataForNode(this);
        if (nodeData && nodeData.lastChild !== undefined) {
          let n = this.lastChild;
          while (n && n.nodeType !== Node.ELEMENT_NODE) {
            n = n.previousSibling;
          }
          return n;
        } else {
          return accessors.lastElementChild(this);
        }
      },
      configurable: true
    },

    children: {
      /**
       * @this {HTMLElement}
       */
      get() {
        if (!isTrackingLogicalChildNodes(this)) {
          return accessors.children(this);
        }
        return createPolyfilledHTMLCollection(Array.prototype.filter.call(this.childNodes, function(n) {
          return (n.nodeType === Node.ELEMENT_NODE);
        }));
      },
      configurable: true
    },

    // element (HTMLElement on IE11)
    innerHTML: {
      /**
       * @this {HTMLElement}
       */
      get() {
        if (isTrackingLogicalChildNodes(this)) {
          const content = this.localName === 'template' ?
          /** @type {HTMLTemplateElement} */(this).content : this;
          return getInnerHTML(content);
        } else {
          return accessors.innerHTML(this);
        }
      },
      /**
       * @this {HTMLElement}
       */
      set(text) {
        const content = this.localName === 'template' ?
          /** @type {HTMLTemplateElement} */(this).content : this;
        clearNode(content);
        const containerName = this.localName || 'div';
        let htmlContainer;
        if (!this.namespaceURI || this.namespaceURI === inertDoc.namespaceURI) {
          htmlContainer = inertDoc.createElement(containerName);
        } else {
          htmlContainer = inertDoc.createElementNS(this.namespaceURI, containerName);
        }
        if (hasDescriptors$1) {
          nodeAccessors.innerHTML.set.call(htmlContainer, text);
        } else {
          htmlContainer.innerHTML = text;
        }
        const newContent = this.localName === 'template' ?
          /** @type {HTMLTemplateElement} */(htmlContainer).content : htmlContainer;
        while (newContent.firstChild) {
          content.appendChild(newContent.firstChild);
        }
      },
      configurable: true
    }

  };

  // Note: Can be patched on element prototype on all browsers.
  // Must be patched on instance on browsers that support native Shadow DOM
  // but do not have builtin accessors (old Chrome).
  let ShadowRootAccessor = {

    shadowRoot: {
      /**
       * @this {HTMLElement}
       */
      get() {
        const nodeData = shadyDataForNode(this);
        return nodeData && nodeData.publicRoot || null;
      },
      configurable: true
    }
  };

  // Note: Can be patched on document prototype on browsers with builtin accessors.
  // Must be patched separately on simulated ShadowRoot.
  // Must be patched as `_activeElement` on browsers without builtin accessors.
  let ActiveElementAccessor = {

    activeElement: {
      /**
       * @this {HTMLElement}
       */
      get() {
        return activeElementForNode(this);
      },
      /**
       * @this {HTMLElement}
       */
      set() {},
      configurable: true
    }

  };

  // patch a group of descriptors on an object only if it exists or if the `force`
  // argument is true.
  /**
   * @param {!Object} obj
   * @param {!Object} descriptors
   * @param {boolean=} force
   */
  function patchAccessorGroup(obj, descriptors, force) {
    for (let p in descriptors) {
      let objDesc = Object.getOwnPropertyDescriptor(obj, p);
      if ((objDesc && objDesc.configurable) ||
        (!objDesc && force)) {
        Object.defineProperty(obj, p, descriptors[p]);
      } else if (force) {
        console.warn('Could not define', p, 'on', obj); // eslint-disable-line no-console
      }
    }
  }

  // patch dom accessors on proto where they exist
  function patchAccessors(proto) {
    patchAccessorGroup(proto, OutsideAccessors);
    patchAccessorGroup(proto, ClassNameAccessor);
    patchAccessorGroup(proto, InsideAccessors);
    patchAccessorGroup(proto, ActiveElementAccessor);
  }

  function patchShadowRootAccessors(proto) {
    proto.__proto__ = DocumentFragment.prototype;
    // ensure element descriptors (IE/Edge don't have em)
    patchAccessorGroup(proto, OutsideAccessors, true);
    patchAccessorGroup(proto, InsideAccessors, true);
    patchAccessorGroup(proto, ActiveElementAccessor, true);
    // Ensure native properties are all safely wrapped since ShadowRoot is not an
    // actual DocumentFragment instance.
    Object.defineProperties(proto, {
      nodeType: {
        value: Node.DOCUMENT_FRAGMENT_NODE,
        configurable: true
      },
      nodeName: {
        value: '#document-fragment',
        configurable: true
      },
      nodeValue: {
        value: null,
        configurable: true
      }
    });
    // make undefined
    [
      'localName',
      'namespaceURI',
      'prefix'
    ].forEach((prop) => {
      Object.defineProperty(proto, prop, {
        value: undefined,
        configurable: true
      });
    });
    // defer properties to host
    [
      'ownerDocument',
      'baseURI',
      'isConnected'
    ].forEach((prop) => {
      Object.defineProperty(proto, prop, {
        get() {
          return this.host[prop];
        },
        configurable: true
      });
    });
  }

  // ensure an element has patched "outside" accessors; no-op when not needed
  let patchOutsideElementAccessors = settings.hasDescriptors ?
    function() {} : function(element) {
      const sd = ensureShadyDataForNode(element);
      if (!sd.__outsideAccessors) {
        sd.__outsideAccessors = true;
        patchAccessorGroup(element, OutsideAccessors, true);
        patchAccessorGroup(element, ClassNameAccessor, true);
      }
    };

  // ensure an element has patched "inside" accessors; no-op when not needed
  let patchInsideElementAccessors = settings.hasDescriptors ?
    function() {} : function(element) {
      const sd = ensureShadyDataForNode(element);
      if (!sd.__insideAccessors) {
        patchAccessorGroup(element, InsideAccessors, true);
        patchAccessorGroup(element, ShadowRootAccessor, true);
      }
    };

  /**
  @license
  Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
  This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
  The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
  The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
  Code distributed by Google as part of the polymer project is also
  subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
  */

  const {childNodes: childNodes$2} = accessors;

  function recordInsertBefore(node, container, ref_node) {
    patchInsideElementAccessors(container);
    const containerData = ensureShadyDataForNode(container);
    if (containerData.firstChild !== undefined) {
      containerData.childNodes = null;
    }
    // handle document fragments
    if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      let c$ = node.childNodes;
      for (let i=0; i < c$.length; i++) {
        linkNode(c$[i], container, ref_node);
      }
      // cleanup logical dom in doc fragment.
      const nodeData = ensureShadyDataForNode(node);
      let resetTo = (nodeData.firstChild !== undefined) ? null : undefined;
      nodeData.firstChild = nodeData.lastChild = resetTo;
      nodeData.childNodes = resetTo;
    } else {
      linkNode(node, container, ref_node);
    }
  }

  function linkNode(node, container, ref_node) {
    patchOutsideElementAccessors(node);
    ref_node = ref_node || null;
    const nodeData = ensureShadyDataForNode(node);
    const containerData = ensureShadyDataForNode(container);
    const ref_nodeData = ref_node ? ensureShadyDataForNode(ref_node) : null;
    // update ref_node.previousSibling <-> node
    nodeData.previousSibling = ref_node ? ref_nodeData.previousSibling :
      container.lastChild;
    let psd = shadyDataForNode(nodeData.previousSibling);
    if (psd) {
      psd.nextSibling = node;
    }
    // update node <-> ref_node
    let nsd = shadyDataForNode(nodeData.nextSibling = ref_node);
    if (nsd) {
      nsd.previousSibling = node;
    }
    // update node <-> container
    nodeData.parentNode = container;
    if (ref_node) {
      if (ref_node === containerData.firstChild) {
        containerData.firstChild = node;
      }
    } else {
      containerData.lastChild = node;
      if (!containerData.firstChild) {
        containerData.firstChild = node;
      }
    }
    // remove caching of childNodes
    containerData.childNodes = null;
  }

  function recordRemoveChild(node, container) {
    const nodeData = ensureShadyDataForNode(node);
    const containerData = ensureShadyDataForNode(container);
    if (node === containerData.firstChild) {
      containerData.firstChild = nodeData.nextSibling;
    }
    if (node === containerData.lastChild) {
      containerData.lastChild = nodeData.previousSibling;
    }
    let p = nodeData.previousSibling;
    let n = nodeData.nextSibling;
    if (p) {
      ensureShadyDataForNode(p).nextSibling = n;
    }
    if (n) {
      ensureShadyDataForNode(n).previousSibling = p;
    }
    // When an element is removed, logical data is no longer tracked.
    // Explicitly set `undefined` here to indicate this. This is disginguished
    // from `null` which is set if info is null.
    nodeData.parentNode = nodeData.previousSibling =
    nodeData.nextSibling = undefined;
    if (containerData.childNodes !== undefined) {
      // remove caching of childNodes
      containerData.childNodes = null;
    }
  }

  /**
   * @param  {!Node} node
   * @param  {Array<Node>=} nodes
   */
  function recordChildNodes(node, nodes) {
    const nodeData = ensureShadyDataForNode(node);
    if (nodeData.firstChild === undefined) {
      // remove caching of childNodes
      nodeData.childNodes = null;
      const c$ = nodes || childNodes$2(node);
      nodeData.firstChild = c$[0] || null;
      nodeData.lastChild = c$[c$.length-1] || null;
      patchInsideElementAccessors(node);
      for (let i=0; i<c$.length; i++) {
        const n = c$[i];
        const sd = ensureShadyDataForNode(n);
        sd.parentNode = node;
        sd.nextSibling = c$[i+1] || null;
        sd.previousSibling = c$[i-1] || null;
        patchOutsideElementAccessors(n);
      }
    }
  }

  /**
  @license
  Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
  This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
  The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
  The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
  Code distributed by Google as part of the polymer project is also
  subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
  */

  const {parentNode: parentNode$2} = accessors;

  // Patched `insertBefore`. Note that all mutations that add nodes are routed
  // here. When a <slot> is added or a node is added to a host with a shadowRoot
  // with a slot, a standard dom `insert` call is aborted and `_asyncRender`
  // is called on the relevant shadowRoot. In all other cases, a standard dom
  // `insert` can be made, but the location and ref_node may need to be changed.
  /**
   * @param {!Node} parent
   * @param {Node} node
   * @param {Node=} ref_node
   */
  function insertBefore$1(parent, node, ref_node) {
    if (node === parent) {
      throw Error(`Failed to execute 'appendChild' on 'Node': The new child element contains the parent.`);
    }
    if (ref_node) {
      const refData = shadyDataForNode(ref_node);
      const p = refData && refData.parentNode;
      if ((p !== undefined && p !== parent) ||
        (p === undefined && parentNode$2(ref_node) !== parent)) {
        throw Error(`Failed to execute 'insertBefore' on 'Node': The node ` +
         `before which the new node is to be inserted is not a child of this node.`);
      }
    }
    if (ref_node === node) {
      return node;
    }
    /** @type {!Array<!HTMLSlotElement>} */
    let slotsAdded = [];
    /** @type {function(!Node, string): void} */
    let scopingFn = addShadyScoping;
    let ownerRoot = ownerShadyRootForNode(parent);
    /** @type {string} */
    const newScopeName = ownerRoot ? ownerRoot.host.localName : '';
    // remove from existing location
    if (node.parentNode) {
      // NOTE: avoid node.removeChild as this *can* trigger another patched
      // method (e.g. custom elements) and we want only the shady method to run.
      // The following table describes what style scoping actions should happen as a result of this insertion.
      // document -> shadowRoot: replace
      // shadowRoot -> shadowRoot: replace
      // shadowRoot -> shadowRoot of same type: do nothing
      // shadowRoot -> document: allow unscoping
      // document -> document: do nothing
      // The "same type of shadowRoot" and "document to document cases rely on `currentScopeIsCorrect` returning true
      const oldScopeName = currentScopeForNode(node);
      removeChild$1(node.parentNode, node, Boolean(ownerRoot) || !(node.getRootNode() instanceof ShadowRoot));
      scopingFn = (node, newScopeName) => {
        replaceShadyScoping(node, newScopeName, oldScopeName);
      };
    }
    // add to new parent
    let allowNativeInsert = true;
    const needsScoping = !currentScopeIsCorrect(node, newScopeName);
    if (ownerRoot && (!node['__noInsertionPoint'] || needsScoping)) {
      treeVisitor(node, (node) => {
        if (node.localName === 'slot') {
          slotsAdded.push(/** @type {!HTMLSlotElement} */(node));
        }
        if (needsScoping) {
          scopingFn(node, newScopeName);
        }
      });
    }
    if (slotsAdded.length) {
      ownerRoot._addSlots(slotsAdded);
    }
    // if a slot is added, must render containing root.
    if (parent.localName === 'slot' || slotsAdded.length) {
      if (ownerRoot) {
        ownerRoot._asyncRender();
      }
    }
    if (isTrackingLogicalChildNodes(parent)) {
      recordInsertBefore(node, parent, ref_node);
      // when inserting into a host with a shadowRoot with slot, use
      // `shadowRoot._asyncRender()` via `attach-shadow` module
      const parentData = shadyDataForNode(parent);
      if (hasShadowRootWithSlot(parent)) {
        parentData.root._asyncRender();
        allowNativeInsert = false;
      // when inserting into a host with shadowRoot with NO slot, do nothing
      // as the node should not be added to composed dome anywhere.
      } else if (parentData.root) {
        allowNativeInsert = false;
      }
    }
    if (allowNativeInsert) {
      // if adding to a shadyRoot, add to host instead
      let container = isShadyRoot(parent) ?
        /** @type {ShadowRoot} */(parent).host : parent;
      // if ref_node, get the ref_node that's actually in composed dom.
      if (ref_node) {
        ref_node = firstComposedNode(ref_node);
        insertBefore.call(container, node, ref_node);
      } else {
        appendChild.call(container, node);
      }
    // Since ownerDocument is not patched, it can be incorrect afer this call
    // if the node is physically appended via distribution. This can result
    // in the custom elements polyfill not upgrading the node if it's in an inert doc.
    // We correct this by calling `adoptNode`.
    } else if (node.ownerDocument !== parent.ownerDocument) {
      parent.ownerDocument.adoptNode(node);
    }
    scheduleObserver(parent, node);
    return node;
  }

  /**
   * Patched `removeChild`. Note that all dom "removals" are routed here.
   * Removes the given `node` from the element's `children`.
   * This method also performs dom composition.
   * @param {Node} parent
   * @param {Node} node
   * @param {boolean=} skipUnscoping
  */
  function removeChild$1(parent, node, skipUnscoping = false) {
    if (node.parentNode !== parent) {
      throw Error('The node to be removed is not a child of this node: ' +
        node);
    }
    let preventNativeRemove;
    let ownerRoot = ownerShadyRootForNode(node);
    let removingInsertionPoint;
    const parentData = shadyDataForNode(parent);
    if (isTrackingLogicalChildNodes(parent)) {
      recordRemoveChild(node, parent);
      if (hasShadowRootWithSlot(parent)) {
        parentData.root._asyncRender();
        preventNativeRemove = true;
      }
    }
    // unscope a node leaving a ShadowRoot if ShadyCSS is present, and this node
    // is not going to be rescoped in `insertBefore`
    if (getScopingShim() && !skipUnscoping && ownerRoot) {
      const oldScopeName = currentScopeForNode(node);
      treeVisitor(node, (node) => {
        removeShadyScoping(node, oldScopeName);
      });
    }
    removeOwnerShadyRoot(node);
    // if removing slot, must render containing root
    if (ownerRoot) {
      let changeSlotContent = parent && parent.localName === 'slot';
      if (changeSlotContent) {
        preventNativeRemove = true;
      }
      removingInsertionPoint = ownerRoot._removeContainedSlots(node);
      if (removingInsertionPoint || changeSlotContent) {
        ownerRoot._asyncRender();
      }
    }
    if (!preventNativeRemove) {
      // if removing from a shadyRoot, remove from host instead
      let container = isShadyRoot(parent) ?
        /** @type {ShadowRoot} */(parent).host :
        parent;
      // not guaranteed to physically be in container; e.g.
      // (1) if parent has a shadyRoot, element may or may not at distributed
      // location (could be undistributed)
      // (2) if parent is a slot, element may not ben in composed dom
      if (!(parentData.root || node.localName === 'slot') ||
        (container === parentNode$2(node))) {
        removeChild.call(container, node);
      }
    }
    scheduleObserver(parent, null, node);
    return node;
  }

  function removeOwnerShadyRoot(node) {
    // optimization: only reset the tree if node is actually in a root
    if (hasCachedOwnerRoot(node)) {
      let c$ = node.childNodes;
      for (let i=0, l=c$.length, n; (i<l) && (n=c$[i]); i++) {
        removeOwnerShadyRoot(n);
      }
    }
    const nodeData = shadyDataForNode(node);
    if (nodeData) {
      nodeData.ownerShadyRoot = undefined;
    }
  }

  function hasCachedOwnerRoot(node) {
    const nodeData = shadyDataForNode(node);
    return Boolean(nodeData && nodeData.ownerShadyRoot !== undefined);
  }

  /**
   * Finds the first flattened node that is composed in the node's parent.
   * If the given node is a slot, then the first flattened node is returned
   * if it exists, otherwise advance to the node's nextSibling.
   * @param {Node} node within which to find first composed node
   * @returns {Node} first composed node
   */
  function firstComposedNode(node) {
    let composed = node;
    if (node && node.localName === 'slot') {
      const nodeData = shadyDataForNode(node);
      const flattened = nodeData && nodeData.flattenedNodes;
      composed = flattened && flattened.length ? flattened[0] :
        firstComposedNode(node.nextSibling);
    }
    return composed;
  }

  function hasShadowRootWithSlot(node) {
    const nodeData = shadyDataForNode(node);
    let root = nodeData && nodeData.root;
    return (root && root._hasInsertionPoint());
  }

  /**
   * Should be called whenever an attribute changes. If the `slot` attribute
   * changes, provokes rendering if necessary. If a `<slot>` element's `name`
   * attribute changes, updates the root's slot map and renders.
   * @param {Node} node
   * @param {string} name
   */
  function distributeAttributeChange(node, name) {
    if (name === 'slot') {
      const parent = node.parentNode;
      if (hasShadowRootWithSlot(parent)) {
        shadyDataForNode(parent).root._asyncRender();
      }
    } else if (node.localName === 'slot' && name === 'name') {
      let root = ownerShadyRootForNode(node);
      if (root) {
        root._updateSlotName(node);
        root._asyncRender();
      }
    }
  }

  /**
   * @param {Node} node
   * @param {Node=} addedNode
   * @param {Node=} removedNode
   */
  function scheduleObserver(node, addedNode, removedNode) {
    const nodeData = shadyDataForNode(node);
    const observer = nodeData && nodeData.observer;
    if (observer) {
      if (addedNode) {
        observer.addedNodes.push(addedNode);
      }
      if (removedNode) {
        observer.removedNodes.push(removedNode);
      }
      observer.schedule();
    }
  }

  /**
   * @param {Node} node
   * @param {Object=} options
   */
  function getRootNode(node, options) { // eslint-disable-line no-unused-vars
    if (!node || !node.nodeType) {
      return;
    }
    const nodeData = ensureShadyDataForNode(node);
    let root = nodeData.ownerShadyRoot;
    if (root === undefined) {
      if (isShadyRoot(node)) {
        root = node;
        nodeData.ownerShadyRoot = root;
      } else {
        let parent = node.parentNode;
        root = parent ? getRootNode(parent) : node;
        // memo-ize result for performance but only memo-ize
        // result if node is in the document. This avoids a problem where a root
        // can be cached while an element is inside a fragment.
        // If this happens and we cache the result, the value can become stale
        // because for perf we avoid processing the subtree of added fragments.
        if (contains$1.call(document.documentElement, node)) {
          nodeData.ownerShadyRoot = root;
        }
      }

    }
    return root;
  }

  // NOTE: `query` is used primarily for ShadyDOM's querySelector impl,
  // but it's also generally useful to recurse through the element tree
  // and is used by Polymer's styling system.
  /**
   * @param {Node} node
   * @param {Function} matcher
   * @param {Function=} halter
   */
  function query(node, matcher, halter) {
    let list = [];
    queryElements(node.childNodes, matcher,
      halter, list);
    return list;
  }

  function queryElements(elements, matcher, halter, list) {
    for (let i=0, l=elements.length, c; (i<l) && (c=elements[i]); i++) {
      if (c.nodeType === Node.ELEMENT_NODE &&
          queryElement(c, matcher, halter, list)) {
        return true;
      }
    }
  }

  function queryElement(node, matcher, halter, list) {
    let result = matcher(node);
    if (result) {
      list.push(node);
    }
    if (halter && halter(result)) {
      return result;
    }
    queryElements(node.childNodes, matcher,
      halter, list);
  }

  function renderRootNode(element) {
    var root = element.getRootNode();
    if (isShadyRoot(root)) {
      root._render();
    }
  }

  let scopingShim = null;

  function getScopingShim() {
    if (!scopingShim) {
      scopingShim = window['ShadyCSS'] && window['ShadyCSS']['ScopingShim'];
    }
    return scopingShim || null;
  }

  function setAttribute$1(node, attr, value) {
    const scopingShim = getScopingShim();
    if (scopingShim && attr === 'class') {
      scopingShim['setElementClass'](node, value);
    } else {
      setAttribute.call(node, attr, value);
      distributeAttributeChange(node, attr);
    }
  }

  function removeAttribute$1(node, attr) {
    removeAttribute.call(node, attr);
    distributeAttributeChange(node, attr);
  }

  function cloneNode$1(node, deep) {
    if (node.localName == 'template') {
      return cloneNode.call(node, deep);
    } else {
      let n = cloneNode.call(node, false);
      // Attribute nodes historically had childNodes, but they have later
      // been removed from the spec.
      // Make sure we do not do a deep clone on them for old browsers (IE11)
      if (deep && n.nodeType !== Node.ATTRIBUTE_NODE) {
        let c$ = node.childNodes;
        for (let i=0, nc; i < c$.length; i++) {
          nc = c$[i].cloneNode(true);
          n.appendChild(nc);
        }
      }
      return n;
    }
  }

  // note: Though not technically correct, we fast path `importNode`
  // when called on a node not owned by the main document.
  // This allows, for example, elements that cannot
  // contain custom elements and are therefore not likely to contain shadowRoots
  // to cloned natively. This is a fairly significant performance win.
  function importNode$1(node, deep) {
    // A template element normally has no children with shadowRoots, so make
    // sure we always make a deep copy to correctly construct the template.content
    if (node.ownerDocument !== document || node.localName === 'template') {
      return importNode.call(document, node, deep);
    }
    let n = importNode.call(document, node, false);
    if (deep) {
      let c$ = node.childNodes;
      for (let i=0, nc; i < c$.length; i++) {
        nc = importNode$1(c$[i], true);
        n.appendChild(nc);
      }
    }
    return n;
  }

  /**
   * @param {!Node} node
   * @param {string} newScopeName
   */
  function addShadyScoping(node, newScopeName) {
    const scopingShim = getScopingShim();
    if (!scopingShim) {
      return;
    }
    scopingShim['scopeNode'](node, newScopeName);
  }

  /**
   * @param {!Node} node
   * @param {string} currentScopeName
   */
  function removeShadyScoping(node, currentScopeName) {
    const scopingShim = getScopingShim();
    if (!scopingShim) {
      return;
    }
    scopingShim['unscopeNode'](node, currentScopeName);
  }

  /**
   * @param {!Node} node
   * @param {string} newScopeName
   * @param {string} oldScopeName
   */
  function replaceShadyScoping(node, newScopeName, oldScopeName) {
    const scopingShim = getScopingShim();
    if (!scopingShim) {
      return;
    }
    removeShadyScoping(node, oldScopeName);
    addShadyScoping(node, newScopeName);
  }

  /**
   * @param {!Node} node
   * @param {string} newScopeName
   * @return {boolean}
   */
  function currentScopeIsCorrect(node, newScopeName) {
    const scopingShim = getScopingShim();
    if (!scopingShim) {
      return true;
    }
    if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      // NOTE: as an optimization, only check that all the top-level children
      // have the correct scope.
      let correctScope = true;
      for (let idx = 0; correctScope && (idx < node.childNodes.length); idx++) {
        correctScope = correctScope &&
          currentScopeIsCorrect(node.childNodes[idx], newScopeName);
      }
      return correctScope;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return true;
    }
    const currentScope = scopingShim['currentScopeForNode'](node);
    return currentScope === newScopeName;
  }

  /**
   * @param {!Node} node
   * @return {string}
   */
  function currentScopeForNode(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }
    const scopingShim = getScopingShim();
    if (!scopingShim) {
      return '';
    }
    return scopingShim['currentScopeForNode'](node);
  }

  /**
   * Walk over a node's tree and apply visitorFn to each element node
   *
   * @param {Node} node
   * @param {function(!Node):void} visitorFn
   */
  function treeVisitor(node, visitorFn) {
    if (!node) {
      return;
    }
    // this check is necessary if `node` is a Document Fragment
    if (node.nodeType === Node.ELEMENT_NODE) {
      visitorFn(node);
    }
    for (let idx = 0, n; idx < node.childNodes.length; idx++) {
      n = node.childNodes[idx];
      if (n.nodeType === Node.ELEMENT_NODE) {
        treeVisitor(n, visitorFn);
      }
    }
  }

  /**
  @license
  Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
  This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
  The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
  The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
  Code distributed by Google as part of the polymer project is also
  subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
  */

  /*
  Make this name unique so it is unlikely to conflict with properties on objects passed to `addEventListener`
  https://github.com/webcomponents/shadydom/issues/173
  */
  const /** string */ eventWrappersName = `__eventWrappers${Date.now()}`;

  /** @type {?function(!Event): boolean} */
  const composedGetter = (() => {
    const composedProp = Object.getOwnPropertyDescriptor(Event.prototype, 'composed');
    return composedProp ? (ev) => composedProp.get.call(ev) : null;
  })();

  // https://github.com/w3c/webcomponents/issues/513#issuecomment-224183937
  const alwaysComposed = {
    'blur': true,
    'focus': true,
    'focusin': true,
    'focusout': true,
    'click': true,
    'dblclick': true,
    'mousedown': true,
    'mouseenter': true,
    'mouseleave': true,
    'mousemove': true,
    'mouseout': true,
    'mouseover': true,
    'mouseup': true,
    'wheel': true,
    'beforeinput': true,
    'input': true,
    'keydown': true,
    'keyup': true,
    'compositionstart': true,
    'compositionupdate': true,
    'compositionend': true,
    'touchstart': true,
    'touchend': true,
    'touchmove': true,
    'touchcancel': true,
    'pointerover': true,
    'pointerenter': true,
    'pointerdown': true,
    'pointermove': true,
    'pointerup': true,
    'pointercancel': true,
    'pointerout': true,
    'pointerleave': true,
    'gotpointercapture': true,
    'lostpointercapture': true,
    'dragstart': true,
    'drag': true,
    'dragenter': true,
    'dragleave': true,
    'dragover': true,
    'drop': true,
    'dragend': true,
    'DOMActivate': true,
    'DOMFocusIn': true,
    'DOMFocusOut': true,
    'keypress': true
  };

  const unpatchedEvents = {
    'DOMAttrModified': true,
    'DOMAttributeNameChanged': true,
    'DOMCharacterDataModified': true,
    'DOMElementNameChanged': true,
    'DOMNodeInserted': true,
    'DOMNodeInsertedIntoDocument': true,
    'DOMNodeRemoved': true,
    'DOMNodeRemovedFromDocument': true,
    'DOMSubtreeModified': true
  };

  function pathComposer(startNode, composed) {
    let composedPath = [];
    let current = startNode;
    let startRoot = startNode === window ? window : startNode.getRootNode();
    while (current) {
      composedPath.push(current);
      if (current.assignedSlot) {
        current = current.assignedSlot;
      } else if (current.nodeType === Node.DOCUMENT_FRAGMENT_NODE && current.host && (composed || current !== startRoot)) {
        current = current.host;
      } else {
        current = current.parentNode;
      }
    }
    // event composedPath includes window when startNode's ownerRoot is document
    if (composedPath[composedPath.length - 1] === document) {
      composedPath.push(window);
    }
    return composedPath;
  }

  function retarget(refNode, path) {
    if (!isShadyRoot) {
      return refNode;
    }
    // If ANCESTOR's root is not a shadow root or ANCESTOR's root is BASE's
    // shadow-including inclusive ancestor, return ANCESTOR.
    let refNodePath = pathComposer(refNode, true);
    let p$ = path;
    for (let i=0, ancestor, lastRoot, root, rootIdx; i < p$.length; i++) {
      ancestor = p$[i];
      root = ancestor === window ? window : ancestor.getRootNode();
      if (root !== lastRoot) {
        rootIdx = refNodePath.indexOf(root);
        lastRoot = root;
      }
      if (!isShadyRoot(root) || rootIdx > -1) {
        return ancestor;
      }
    }
  }

  let eventMixin = {

    /**
     * @this {Event}
     */
    get composed() {
      if (this.__composed === undefined) {
        // if there's an original `composed` getter on the Event prototype, use that
        if (composedGetter) {
          // TODO(web-padawan): see https://github.com/webcomponents/shadydom/issues/275
          this.__composed = this.type === 'focusin' || this.type === 'focusout' || composedGetter(this);
        // If the event is trusted, or `isTrusted` is not supported, check the list of always composed events
        } else if (this.isTrusted !== false) {
          this.__composed = alwaysComposed[this.type];
        }
      }
      return this.__composed || false;
    },

    /**
     * @this {Event}
     */
    composedPath() {
      if (!this.__composedPath) {
        this.__composedPath = pathComposer(this['__target'], this.composed);
      }
      return this.__composedPath;
    },

    /**
     * @this {Event}
     */
    get target() {
      return retarget(this.currentTarget || this['__previousCurrentTarget'], this.composedPath());
    },

    // http://w3c.github.io/webcomponents/spec/shadow/#event-relatedtarget-retargeting
    /**
     * @this {Event}
     */
    get relatedTarget() {
      if (!this.__relatedTarget) {
        return null;
      }
      if (!this.__relatedTargetComposedPath) {
        this.__relatedTargetComposedPath = pathComposer(this.__relatedTarget, true);
      }
      // find the deepest node in relatedTarget composed path that is in the same root with the currentTarget
      return retarget(this.currentTarget || this['__previousCurrentTarget'], this.__relatedTargetComposedPath);
    },
    /**
     * @this {Event}
     */
    stopPropagation() {
      Event.prototype.stopPropagation.call(this);
      this.__propagationStopped = true;
    },
    /**
     * @this {Event}
     */
    stopImmediatePropagation() {
      Event.prototype.stopImmediatePropagation.call(this);
      this.__immediatePropagationStopped = true;
      this.__propagationStopped = true;
    }

  };

  function mixinComposedFlag(Base) {
    // NOTE: avoiding use of `class` here so that transpiled output does not
    // try to do `Base.call` with a dom construtor.
    let klazz = function(type, options) {
      let event = new Base(type, options);
      event.__composed = options && Boolean(options['composed']);
      return event;
    };
    // put constructor properties on subclass
    mixin(klazz, Base);
    klazz.prototype = Base.prototype;
    return klazz;
  }

  let nonBubblingEventsToRetarget = {
    'focus': true,
    'blur': true
  };


  /**
   * Check if the event has been retargeted by comparing original `target`, and calculated `target`
   * @param {Event} event
   * @return {boolean} True if the original target and calculated target are the same
   */
  function hasRetargeted(event) {
    return event['__target'] !== event.target || event.__relatedTarget !== event.relatedTarget;
  }

  /**
   *
   * @param {Event} event
   * @param {Node} node
   * @param {string} phase
   */
  function fireHandlers(event, node, phase) {
    let hs = node.__handlers && node.__handlers[event.type] &&
      node.__handlers[event.type][phase];
    if (hs) {
      for (let i = 0, fn; (fn = hs[i]); i++) {
        if (hasRetargeted(event) && event.target === event.relatedTarget) {
          return;
        }
        fn.call(node, event);
        if (event.__immediatePropagationStopped) {
          return;
        }
      }
    }
  }

  function retargetNonBubblingEvent(e) {
    let path = e.composedPath();
    let node;
    // override `currentTarget` to let patched `target` calculate correctly
    Object.defineProperty(e, 'currentTarget', {
      get: function() {
        return node;
      },
      configurable: true
    });
    for (let i = path.length - 1; i >= 0; i--) {
      node = path[i];
      // capture phase fires all capture handlers
      fireHandlers(e, node, 'capture');
      if (e.__propagationStopped) {
        return;
      }
    }

    // set the event phase to `AT_TARGET` as in spec
    Object.defineProperty(e, 'eventPhase', {get() { return Event.AT_TARGET }});

    // the event only needs to be fired when owner roots change when iterating the event path
    // keep track of the last seen owner root
    let lastFiredRoot;
    for (let i = 0; i < path.length; i++) {
      node = path[i];
      const nodeData = shadyDataForNode(node);
      const root = nodeData && nodeData.root;
      if (i === 0 || (root && root === lastFiredRoot)) {
        fireHandlers(e, node, 'bubble');
        // don't bother with window, it doesn't have `getRootNode` and will be last in the path anyway
        if (node !== window) {
          lastFiredRoot = node.getRootNode();
        }
        if (e.__propagationStopped) {
          return;
        }
      }
    }
  }

  function listenerSettingsEqual(savedListener, node, type, capture, once, passive) {
    let {
      node: savedNode,
      type: savedType,
      capture: savedCapture,
      once: savedOnce,
      passive: savedPassive
    } = savedListener;
    return node === savedNode &&
      type === savedType &&
      capture === savedCapture &&
      once === savedOnce &&
      passive === savedPassive;
  }

  function findListener(wrappers, node, type, capture, once, passive) {
    for (let i = 0; i < wrappers.length; i++) {
      if (listenerSettingsEqual(wrappers[i], node, type, capture, once, passive)) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Firefox can throw on accessing eventWrappers inside of `removeEventListener` during a selenium run
   * Try/Catch accessing eventWrappers to work around
   * https://bugzilla.mozilla.org/show_bug.cgi?id=1353074
   */
  function getEventWrappers(eventLike) {
    let wrappers = null;
    try {
      wrappers = eventLike[eventWrappersName];
    } catch (e) {} // eslint-disable-line no-empty
    return wrappers;
  }

  /**
   * @this {Event}
   */
  function addEventListener$1(type, fnOrObj, optionsOrCapture) {
    if (!fnOrObj) {
      return;
    }

    const handlerType = typeof fnOrObj;

    // bail if `fnOrObj` is not a function, not an object
    if (handlerType !== 'function' && handlerType !== 'object') {
      return;
    }

    // bail if `fnOrObj` is an object without a `handleEvent` method
    if (handlerType === 'object' && (!fnOrObj.handleEvent || typeof fnOrObj.handleEvent !== 'function')) {
      return;
    }

    const ael = this instanceof Window ? windowAddEventListener :
        addEventListener;

    if (unpatchedEvents[type]) {
      return ael.call(this, type, fnOrObj, optionsOrCapture);
    }

    // The callback `fn` might be used for multiple nodes/events. Since we generate
    // a wrapper function, we need to keep track of it when we remove the listener.
    // It's more efficient to store the node/type/options information as Array in
    // `fn` itself rather than the node (we assume that the same callback is used
    // for few nodes at most, whereas a node will likely have many event listeners).
    // NOTE(valdrin) invoking external functions is costly, inline has better perf.
    let capture, once, passive;
    if (optionsOrCapture && typeof optionsOrCapture === 'object') {
      capture = Boolean(optionsOrCapture.capture);
      once = Boolean(optionsOrCapture.once);
      passive = Boolean(optionsOrCapture.passive);
    } else {
      capture = Boolean(optionsOrCapture);
      once = false;
      passive = false;
    }
    // hack to let ShadyRoots have event listeners
    // event listener will be on host, but `currentTarget`
    // will be set to shadyroot for event listener
    let target = (optionsOrCapture && optionsOrCapture.__shadyTarget) || this;

    let wrappers = fnOrObj[eventWrappersName];
    if (wrappers) {
      // Stop if the wrapper function has already been created.
      if (findListener(wrappers, target, type, capture, once, passive) > -1) {
        return;
      }
    } else {
      fnOrObj[eventWrappersName] = [];
    }

    /**
     * @this {HTMLElement}
     * @param {Event} e
     */
    const wrapperFn = function(e) {
      // Support `once` option.
      if (once) {
        this.removeEventListener(type, fnOrObj, optionsOrCapture);
      }
      if (!e['__target']) {
        patchEvent(e);
      }
      let lastCurrentTargetDesc;
      if (target !== this) {
        // replace `currentTarget` to make `target` and `relatedTarget` correct for inside the shadowroot
        lastCurrentTargetDesc = Object.getOwnPropertyDescriptor(e, 'currentTarget');
        Object.defineProperty(e, 'currentTarget', {get() { return target }, configurable: true});
      }
      e['__previousCurrentTarget'] = e['currentTarget'];
      // Always check if a shadowRoot is in the current event path.
      // If it is not, the event was generated on either the host of the shadowRoot
      // or a children of the host.
      if (isShadyRoot(target) && e.composedPath().indexOf(target) == -1) {
        return;
      }
      // There are two critera that should stop events from firing on this node
      // 1. the event is not composed and the current node is not in the same root as the target
      // 2. when bubbling, if after retargeting, relatedTarget and target point to the same node
      if (e.composed || e.composedPath().indexOf(target) > -1) {
        if (hasRetargeted(e) && e.target === e.relatedTarget) {
          if (e.eventPhase === Event.BUBBLING_PHASE) {
            e.stopImmediatePropagation();
          }
          return;
        }
        // prevent non-bubbling events from triggering bubbling handlers on shadowroot, but only if not in capture phase
        if (e.eventPhase !== Event.CAPTURING_PHASE && !e.bubbles && e.target !== target && !(target instanceof Window)) {
          return;
        }
        let ret = handlerType === 'function' ?
          fnOrObj.call(target, e) :
          (fnOrObj.handleEvent && fnOrObj.handleEvent(e));
        if (target !== this) {
          // replace the "correct" `currentTarget`
          if (lastCurrentTargetDesc) {
            Object.defineProperty(e, 'currentTarget', lastCurrentTargetDesc);
            lastCurrentTargetDesc = null;
          } else {
            delete e['currentTarget'];
          }
        }
        return ret;
      }
    };
    // Store the wrapper information.
    fnOrObj[eventWrappersName].push({
      // note: use target here which is either a shadowRoot
      // (when the host element is proxy'ing the event) or this element
      node: target,
      type: type,
      capture: capture,
      once: once,
      passive: passive,
      wrapperFn: wrapperFn
    });

    if (nonBubblingEventsToRetarget[type]) {
      this.__handlers = this.__handlers || {};
      this.__handlers[type] = this.__handlers[type] ||
        {'capture': [], 'bubble': []};
      this.__handlers[type][capture ? 'capture' : 'bubble'].push(wrapperFn);
    } else {
      ael.call(this, type, wrapperFn, optionsOrCapture);
    }
  }

  /**
   * @this {Event}
   */
  function removeEventListener$1(type, fnOrObj, optionsOrCapture) {
    if (!fnOrObj) {
      return;
    }
    const rel = this instanceof Window ? windowRemoveEventListener :
      removeEventListener;
    if (unpatchedEvents[type]) {
      return rel.call(this, type, fnOrObj, optionsOrCapture);
    }
    // NOTE(valdrin) invoking external functions is costly, inline has better perf.
    let capture, once, passive;
    if (optionsOrCapture && typeof optionsOrCapture === 'object') {
      capture = Boolean(optionsOrCapture.capture);
      once = Boolean(optionsOrCapture.once);
      passive = Boolean(optionsOrCapture.passive);
    } else {
      capture = Boolean(optionsOrCapture);
      once = false;
      passive = false;
    }
    let target = (optionsOrCapture && optionsOrCapture.__shadyTarget) || this;
    // Search the wrapped function.
    let wrapperFn = undefined;
    let wrappers = getEventWrappers(fnOrObj);
    if (wrappers) {
      let idx = findListener(wrappers, target, type, capture, once, passive);
      if (idx > -1) {
        wrapperFn = wrappers.splice(idx, 1)[0].wrapperFn;
        // Cleanup.
        if (!wrappers.length) {
          fnOrObj[eventWrappersName] = undefined;
        }
      }
    }
    rel.call(this, type, wrapperFn || fnOrObj, optionsOrCapture);
    if (wrapperFn && nonBubblingEventsToRetarget[type] &&
        this.__handlers && this.__handlers[type]) {
      const arr = this.__handlers[type][capture ? 'capture' : 'bubble'];
      const idx = arr.indexOf(wrapperFn);
      if (idx > -1) {
        arr.splice(idx, 1);
      }
    }
  }

  function activateFocusEventOverrides() {
    for (let ev in nonBubblingEventsToRetarget) {
      window.addEventListener(ev, function(e) {
        if (!e['__target']) {
          patchEvent(e);
          retargetNonBubblingEvent(e);
        }
      }, true);
    }
  }

  function patchEvent(event) {
    event['__target'] = event.target;
    event.__relatedTarget = event.relatedTarget;
    // patch event prototype if we can
    if (settings.hasDescriptors) {
      patchPrototype(event, eventMixin);
    // and fallback to patching instance
    } else {
      extend(event, eventMixin);
    }
  }

  let PatchedEvent = mixinComposedFlag(window.Event);
  let PatchedCustomEvent = mixinComposedFlag(window.CustomEvent);
  let PatchedMouseEvent = mixinComposedFlag(window.MouseEvent);

  function patchEvents() {
    window.Event = PatchedEvent;
    window.CustomEvent = PatchedCustomEvent;
    window.MouseEvent = PatchedMouseEvent;
    activateFocusEventOverrides();

    // Fix up `Element.prototype.click()` if `isTrusted` is supported, but `composed` isn't
    if (!composedGetter && Object.getOwnPropertyDescriptor(Event.prototype, 'isTrusted')) {
      /** @this {Element} */
      const composedClickFn = function() {
        const ev = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          composed: true
        });
        this.dispatchEvent(ev);
      };
      if (Element.prototype.click) {
        Element.prototype.click = composedClickFn;
      } else if (HTMLElement.prototype.click) {
        HTMLElement.prototype.click = composedClickFn;
      }
    }
  }

  /**
  @license
  Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
  This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
  The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
  The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
  Code distributed by Google as part of the polymer project is also
  subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
  */

  function newSplice(index, removed, addedCount) {
    return {
      index: index,
      removed: removed,
      addedCount: addedCount
    };
  }

  const EDIT_LEAVE = 0;
  const EDIT_UPDATE = 1;
  const EDIT_ADD = 2;
  const EDIT_DELETE = 3;

  // Note: This function is *based* on the computation of the Levenshtein
  // "edit" distance. The one change is that "updates" are treated as two
  // edits - not one. With Array splices, an update is really a delete
  // followed by an add. By retaining this, we optimize for "keeping" the
  // maximum array items in the original array. For example:
  //
  //   'xxxx123' -> '123yyyy'
  //
  // With 1-edit updates, the shortest path would be just to update all seven
  // characters. With 2-edit updates, we delete 4, leave 3, and add 4. This
  // leaves the substring '123' intact.
  function calcEditDistances(current, currentStart, currentEnd,
                              old, oldStart, oldEnd) {
    // "Deletion" columns
    let rowCount = oldEnd - oldStart + 1;
    let columnCount = currentEnd - currentStart + 1;
    let distances = new Array(rowCount);

    // "Addition" rows. Initialize null column.
    for (let i = 0; i < rowCount; i++) {
      distances[i] = new Array(columnCount);
      distances[i][0] = i;
    }

    // Initialize null row
    for (let j = 0; j < columnCount; j++)
      distances[0][j] = j;

    for (let i = 1; i < rowCount; i++) {
      for (let j = 1; j < columnCount; j++) {
        if (equals(current[currentStart + j - 1], old[oldStart + i - 1]))
          distances[i][j] = distances[i - 1][j - 1];
        else {
          let north = distances[i - 1][j] + 1;
          let west = distances[i][j - 1] + 1;
          distances[i][j] = north < west ? north : west;
        }
      }
    }

    return distances;
  }

  // This starts at the final weight, and walks "backward" by finding
  // the minimum previous weight recursively until the origin of the weight
  // matrix.
  function spliceOperationsFromEditDistances(distances) {
    let i = distances.length - 1;
    let j = distances[0].length - 1;
    let current = distances[i][j];
    let edits = [];
    while (i > 0 || j > 0) {
      if (i == 0) {
        edits.push(EDIT_ADD);
        j--;
        continue;
      }
      if (j == 0) {
        edits.push(EDIT_DELETE);
        i--;
        continue;
      }
      let northWest = distances[i - 1][j - 1];
      let west = distances[i - 1][j];
      let north = distances[i][j - 1];

      let min;
      if (west < north)
        min = west < northWest ? west : northWest;
      else
        min = north < northWest ? north : northWest;

      if (min == northWest) {
        if (northWest == current) {
          edits.push(EDIT_LEAVE);
        } else {
          edits.push(EDIT_UPDATE);
          current = northWest;
        }
        i--;
        j--;
      } else if (min == west) {
        edits.push(EDIT_DELETE);
        i--;
        current = west;
      } else {
        edits.push(EDIT_ADD);
        j--;
        current = north;
      }
    }

    edits.reverse();
    return edits;
  }

  /**
   * Splice Projection functions:
   *
   * A splice map is a representation of how a previous array of items
   * was transformed into a new array of items. Conceptually it is a list of
   * tuples of
   *
   *   <index, removed, addedCount>
   *
   * which are kept in ascending index order of. The tuple represents that at
   * the |index|, |removed| sequence of items were removed, and counting forward
   * from |index|, |addedCount| items were added.
   */

  /**
   * Lacking individual splice mutation information, the minimal set of
   * splices can be synthesized given the previous state and final state of an
   * array. The basic approach is to calculate the edit distance matrix and
   * choose the shortest path through it.
   *
   * Complexity: O(l * p)
   *   l: The length of the current array
   *   p: The length of the old array
   */
  function calcSplices(current, currentStart, currentEnd,
                        old, oldStart, oldEnd) {
    let prefixCount = 0;
    let suffixCount = 0;
    let splice;

    let minLength = Math.min(currentEnd - currentStart, oldEnd - oldStart);
    if (currentStart == 0 && oldStart == 0)
      prefixCount = sharedPrefix(current, old, minLength);

    if (currentEnd == current.length && oldEnd == old.length)
      suffixCount = sharedSuffix(current, old, minLength - prefixCount);

    currentStart += prefixCount;
    oldStart += prefixCount;
    currentEnd -= suffixCount;
    oldEnd -= suffixCount;

    if (currentEnd - currentStart == 0 && oldEnd - oldStart == 0)
      return [];

    if (currentStart == currentEnd) {
      splice = newSplice(currentStart, [], 0);
      while (oldStart < oldEnd)
        splice.removed.push(old[oldStart++]);

      return [ splice ];
    } else if (oldStart == oldEnd)
      return [ newSplice(currentStart, [], currentEnd - currentStart) ];

    let ops = spliceOperationsFromEditDistances(
        calcEditDistances(current, currentStart, currentEnd,
                               old, oldStart, oldEnd));

    splice = undefined;
    let splices = [];
    let index = currentStart;
    let oldIndex = oldStart;
    for (let i = 0; i < ops.length; i++) {
      switch(ops[i]) {
        case EDIT_LEAVE:
          if (splice) {
            splices.push(splice);
            splice = undefined;
          }

          index++;
          oldIndex++;
          break;
        case EDIT_UPDATE:
          if (!splice)
            splice = newSplice(index, [], 0);

          splice.addedCount++;
          index++;

          splice.removed.push(old[oldIndex]);
          oldIndex++;
          break;
        case EDIT_ADD:
          if (!splice)
            splice = newSplice(index, [], 0);

          splice.addedCount++;
          index++;
          break;
        case EDIT_DELETE:
          if (!splice)
            splice = newSplice(index, [], 0);

          splice.removed.push(old[oldIndex]);
          oldIndex++;
          break;
      }
    }

    if (splice) {
      splices.push(splice);
    }
    return splices;
  }

  function sharedPrefix(current, old, searchLength) {
    for (let i = 0; i < searchLength; i++)
      if (!equals(current[i], old[i]))
        return i;
    return searchLength;
  }

  function sharedSuffix(current, old, searchLength) {
    let index1 = current.length;
    let index2 = old.length;
    let count = 0;
    while (count < searchLength && equals(current[--index1], old[--index2]))
      count++;

    return count;
  }

  function equals(currentValue, previousValue) {
    return currentValue === previousValue;
  }

  function calculateSplices(current, previous) {
    return calcSplices(current, 0, current.length, previous, 0,
                            previous.length);
  }

  /**
  @license
  Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
  This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
  The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
  The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
  Code distributed by Google as part of the polymer project is also
  subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
  */

  const {parentNode: parentNode$3, childNodes: childNodes$3} = accessors;

  // Do not export this object. It must be passed as the first argument to the
  // ShadyRoot constructor in `attachShadow` to prevent the constructor from
  // throwing. This prevents the user from being able to manually construct a
  // ShadyRoot (i.e. `new ShadowRoot()`).
  const ShadyRootConstructionToken = {};

  const CATCHALL_NAME = '__catchall';
  const SHADYROOT_NAME = 'ShadyRoot';

  const MODE_CLOSED = 'closed';

  let isRendering = settings['deferConnectionCallbacks'] && document.readyState === 'loading';
  let rootRendered;

  function ancestorList(node) {
    let ancestors = [];
    do {
      ancestors.unshift(node);
    } while ((node = node.parentNode));
    return ancestors;
  }

  /**
   * @extends {ShadowRoot}
   */
  class ShadyRoot {

    constructor(token, host, options) {
      if (token !== ShadyRootConstructionToken) {
        throw new TypeError('Illegal constructor');
      }
      // NOTE: set a fake local name so this element can be
      // distinguished from a DocumentFragment when patching.
      // FF doesn't allow this to be `localName`
      this._localName = SHADYROOT_NAME;
      // root <=> host
      this.host = host;
      this._mode = options && options.mode;
      recordChildNodes(host);
      const hostData = ensureShadyDataForNode(host);
      hostData.root = this;
      hostData.publicRoot = this._mode !== MODE_CLOSED ? this : null;
      // setup root
      const rootData = ensureShadyDataForNode(this);
      rootData.firstChild = rootData.lastChild =
          rootData.parentNode = rootData.nextSibling =
          rootData.previousSibling = null;
      rootData.childNodes = [];
      // state flags
      this._renderPending = false;
      this._hasRendered = false;
      // marsalled lazily
      this._slotList = null;
      /** @type {Object<string, Array<HTMLSlotElement>>} */
      this._slotMap = null;
      this._pendingSlots = null;
      this._initialChildren = null;
      this._asyncRender();
    }

    // async render
    _asyncRender() {
      if (!this._renderPending) {
        this._renderPending = true;
        enqueue(() => this._render());
      }
    }

    // returns the oldest renderPending ancestor root.
    _getRenderRoot() {
      let renderRoot;
      let root = this;
      while (root) {
        if (root._renderPending) {
          renderRoot = root;
        }
        root = root._rendererForHost();
      }
      return renderRoot;
    }

    // Returns the shadyRoot `this.host` if `this.host`
    // has children that require distribution.
    _rendererForHost() {
      let root = this.host.getRootNode();
      if (isShadyRoot(root)) {
        let c$ = this.host.childNodes;
        for (let i=0, c; i < c$.length; i++) {
          c = c$[i];
          if (this._isInsertionPoint(c)) {
            return root;
          }
        }
      }
    }

    _render() {
      const root = this._getRenderRoot();
      if (root) {
        root['_renderRoot']();
      }
    }

    // NOTE: avoid renaming to ease testability.
    ['_renderRoot']() {
      // track rendering state.
      const wasRendering = isRendering;
      isRendering = true;
      this._renderPending = false;
      if (this._slotList) {
        this._distribute();
        this._compose();
      }
      // on initial render remove any undistributed children.
      if (!this._hasRendered) {
        const c$ = this.host.childNodes;
        for (let i=0, l=c$.length; i < l; i++) {
          const child = c$[i];
          const data = shadyDataForNode(child);
          if (parentNode$3(child) === this.host &&
              (child.localName === 'slot' || !data.assignedSlot)) {
            removeChild.call(this.host, child);
          }
        }
      }
      this._hasRendered = true;
      isRendering = wasRendering;
      if (rootRendered) {
        rootRendered();
      }
    }

    _distribute() {
      this._validateSlots();
      // capture # of previously assigned nodes to help determine if dirty.
      for (let i=0, slot; i < this._slotList.length; i++) {
        slot = this._slotList[i];
        this._clearSlotAssignedNodes(slot);
      }
      // distribute host children.
      for (let n=this.host.firstChild; n; n=n.nextSibling) {
        this._distributeNodeToSlot(n);
      }
      // fallback content, slotchange, and dirty roots
      for (let i=0; i < this._slotList.length; i++) {
        const slot = this._slotList[i];
        const slotData = shadyDataForNode(slot);
        // distribute fallback content
        if (!slotData.assignedNodes.length) {
          for (let n=slot.firstChild; n; n=n.nextSibling) {
            this._distributeNodeToSlot(n, slot);
          }
        }
        const slotParentData = shadyDataForNode(slot.parentNode);
        const slotParentRoot = slotParentData && slotParentData.root;
        if (slotParentRoot && (slotParentRoot._hasInsertionPoint() || slotParentRoot._renderPending)) {
          slotParentRoot['_renderRoot']();
        }
        this._addAssignedToFlattenedNodes(slotData.flattenedNodes,
          slotData.assignedNodes);
        let prevAssignedNodes = slotData._previouslyAssignedNodes;
        if (prevAssignedNodes) {
          for (let i=0; i < prevAssignedNodes.length; i++) {
            shadyDataForNode(prevAssignedNodes[i])._prevAssignedSlot = null;
          }
          slotData._previouslyAssignedNodes = null;
          // dirty if previously less assigned nodes than previously assigned.
          if (prevAssignedNodes.length > slotData.assignedNodes.length) {
            slotData.dirty = true;
          }
        }
        /* Note: A slot is marked dirty whenever a node is newly assigned to it
        or a node is assigned to a different slot (done in `_distributeNodeToSlot`)
        or if the number of nodes assigned to the slot has decreased (done above);
        */
        if (slotData.dirty) {
          slotData.dirty = false;
          this._fireSlotChange(slot);
        }
      }
    }

    /**
     * Distributes given `node` to the appropriate slot based on its `slot`
     * attribute. If `forcedSlot` is given, then the node is distributed to the
     * `forcedSlot`.
     * Note: slot to which the node is assigned will be marked dirty for firing
     * `slotchange`.
     * @param {Node} node
     * @param {Node=} forcedSlot
     *
     */
    _distributeNodeToSlot(node, forcedSlot) {
      const nodeData = ensureShadyDataForNode(node);
      let oldSlot = nodeData._prevAssignedSlot;
      nodeData._prevAssignedSlot = null;
      let slot = forcedSlot;
      if (!slot) {
        let name = node.slot || CATCHALL_NAME;
        const list = this._slotMap[name];
        slot = list && list[0];
      }
      if (slot) {
        const slotData = ensureShadyDataForNode(slot);
        slotData.assignedNodes.push(node);
        nodeData.assignedSlot = slot;
      } else {
        nodeData.assignedSlot = undefined;
      }
      if (oldSlot !== nodeData.assignedSlot) {
        if (nodeData.assignedSlot) {
          ensureShadyDataForNode(nodeData.assignedSlot).dirty = true;
        }
      }
    }

    /**
     * Clears the assignedNodes tracking data for a given `slot`. Note, the current
     * assigned node data is tracked (via _previouslyAssignedNodes and
     * _prevAssignedSlot) to see if `slotchange` should fire. This data may be out
     *  of date at this time because the assigned nodes may have already been
     * distributed to another root. This is ok since this data is only used to
     * track changes.
     * @param {HTMLSlotElement} slot
     */
    _clearSlotAssignedNodes(slot) {
      const slotData = shadyDataForNode(slot);
      let n$ = slotData.assignedNodes;
      slotData.assignedNodes = [];
      slotData.flattenedNodes = [];
      slotData._previouslyAssignedNodes = n$;
      if (n$) {
        for (let i=0; i < n$.length; i++) {
          let n = shadyDataForNode(n$[i]);
          n._prevAssignedSlot = n.assignedSlot;
          // only clear if it was previously set to this slot;
          // this helps ensure that if the node has otherwise been distributed
          // ignore it.
          if (n.assignedSlot === slot) {
            n.assignedSlot = null;
          }
        }
      }
    }

    _addAssignedToFlattenedNodes(flattened, assigned) {
      for (let i=0, n; (i<assigned.length) && (n=assigned[i]); i++) {
        if (n.localName == 'slot') {
          const nestedAssigned = shadyDataForNode(n).assignedNodes;
          if (nestedAssigned && nestedAssigned.length) {
            this._addAssignedToFlattenedNodes(flattened, nestedAssigned);
          }
        } else {
          flattened.push(assigned[i]);
        }
      }
    }

    _fireSlotChange(slot) {
      // NOTE: cannot bubble correctly here so not setting bubbles: true
      // Safari tech preview does not bubble but chrome does
      // Spec says it bubbles (https://dom.spec.whatwg.org/#mutation-observers)
      dispatchEvent.call(slot, new Event('slotchange'));
      const slotData = shadyDataForNode(slot);
      if (slotData.assignedSlot) {
        this._fireSlotChange(slotData.assignedSlot);
      }
    }

    // Reify dom such that it is at its correct rendering position
    // based on logical distribution.
    // NOTE: here we only compose parents of <slot> elements and not the
    // shadowRoot into the host. The latter is performend via a fast path
    // in the `logical-mutation`.insertBefore.
    _compose() {
      const slots = this._slotList;
      let composeList = [];
      for (let i=0; i < slots.length; i++) {
        const parent = slots[i].parentNode;
        /* compose node only if:
          (1) parent does not have a shadowRoot since shadowRoot has already
          composed into the host
          (2) we're not already composing it
          [consider (n^2) but rare better than Set]
        */
        const parentData = shadyDataForNode(parent);
        if (!(parentData && parentData.root) &&
          composeList.indexOf(parent) < 0) {
          composeList.push(parent);
        }
      }
      for (let i=0; i < composeList.length; i++) {
        const node = composeList[i];
        const targetNode = node === this ? this.host : node;
        this._updateChildNodes(targetNode, this._composeNode(node));
      }
    }

    // Returns the list of nodes which should be rendered inside `node`.
    _composeNode(node) {
      let children = [];
      let c$ = node.childNodes;
      for (let i = 0; i < c$.length; i++) {
        let child = c$[i];
        // Note: if we see a slot here, the nodes are guaranteed to need to be
        // composed here. This is because if there is redistribution, it has
        // already been handled by this point.
        if (this._isInsertionPoint(child)) {
          let flattenedNodes = shadyDataForNode(child).flattenedNodes;
          for (let j = 0; j < flattenedNodes.length; j++) {
            let distributedNode = flattenedNodes[j];
              children.push(distributedNode);
          }
        } else {
          children.push(child);
        }
      }
      return children;
    }

    _isInsertionPoint(node) {
        return node.localName == 'slot';
      }

    // Ensures that the rendered node list inside `container` is `children`.
    _updateChildNodes(container, children) {
      let composed = childNodes$3(container);
      let splices = calculateSplices(children, composed);
      // process removals
      for (let i=0, d=0, s; (i<splices.length) && (s=splices[i]); i++) {
        for (let j=0, n; (j < s.removed.length) && (n=s.removed[j]); j++) {
          // check if the node is still where we expect it is before trying
          // to remove it; this can happen if we move a node and
          // then schedule its previous host for distribution resulting in
          // the node being removed here.
          if (parentNode$3(n) === container) {
            removeChild.call(container, n);
          }
          // TODO(sorvell): avoid the need for splicing here.
          composed.splice(s.index + d, 1);
        }
        d -= s.addedCount;
      }
      // process adds
      for (let i=0, s, next; (i<splices.length) && (s=splices[i]); i++) { //eslint-disable-line no-redeclare
        next = composed[s.index];
        for (let j=s.index, n; j < s.index + s.addedCount; j++) {
          n = children[j];
          insertBefore.call(container, n, next);
          composed.splice(j, 0, n);
        }
      }
    }

    _ensureSlotData() {
      this._pendingSlots = this._pendingSlots || [];
      this._slotList = this._slotList || [];
      this._slotMap = this._slotMap || {};
    }

    _addSlots(slots) {
      this._ensureSlotData();
      this._pendingSlots.push(...slots);
    }

    _validateSlots() {
      if (this._pendingSlots && this._pendingSlots.length) {
        this._mapSlots(this._pendingSlots);
        this._pendingSlots = [];
      }
    }

    /**
     * Adds the given slots. Slots are maintained in an dom-ordered list.
     * In addition a map of name to slot is updated.
     */
    _mapSlots(slots) {
      let slotNamesToSort;
      for (let i=0; i < slots.length; i++) {
        let slot = slots[i];
        // ensure insertionPoints's and their parents have logical dom info.
        // save logical tree info
        // a. for shadyRoot
        // b. for insertion points (fallback)
        // c. for parents of insertion points
        recordChildNodes(slot);
        recordChildNodes(slot.parentNode);
        let name = this._nameForSlot(slot);
        if (this._slotMap[name]) {
          slotNamesToSort = slotNamesToSort || {};
          slotNamesToSort[name] = true;
          this._slotMap[name].push(slot);
        } else {
          this._slotMap[name] = [slot];
        }
        this._slotList.push(slot);
      }
      if (slotNamesToSort) {
        for (let n in slotNamesToSort) {
          this._slotMap[n] = this._sortSlots(this._slotMap[n]);
        }
      }
    }

    _nameForSlot(slot) {
      const name = slot['name'] || slot.getAttribute('name') || CATCHALL_NAME;
      slot.__slotName = name;
      return name;
    }

    /**
     * Slots are kept in an ordered list. Slots with the same name
     * are sorted here by tree order.
     */
    _sortSlots(slots) {
      // NOTE: Cannot use `compareDocumentPosition` because it's not polyfilled,
      // but the code here could be used to polyfill the preceeding/following info
      // in `compareDocumentPosition`.
      return slots.sort((a, b) => {
        let listA = ancestorList(a);
        let listB = ancestorList(b);
        for (var i=0; i < listA.length; i++) {
          let nA = listA[i];
          let nB = listB[i];
          if (nA !== nB) {
            let c$ = Array.from(nA.parentNode.childNodes);
            return c$.indexOf(nA) - c$.indexOf(nB);
          }
        }
      });
    }

    /**
     * Removes from tracked slot data any slots contained within `container` and
     * then updates the tracked data (_slotList and _slotMap).
     * Any removed slots also have their `assignedNodes` removed from comopsed dom.
     */
    _removeContainedSlots(container) {
      if (!this._slotList) {
        return;
      }
      this._validateSlots();
      let didRemove;
      const map = this._slotMap;
      for (let n in map) {
        let slots = map[n];
        for (let i=0; i < slots.length; i++) {
          let slot = slots[i];
          if (contains(container, slot)) {
            slots.splice(i, 1);
            const x = this._slotList.indexOf(slot);
            if (x >= 0) {
              this._slotList.splice(x, 1);
            }
            i--;
            this._removeFlattenedNodes(slot);
            didRemove = true;
          }
        }
      }
      return didRemove;
    }

    _updateSlotName(slot) {
      if (!this._slotList) {
        return;
      }
      // make sure slotMap is initialized with this slot
      this._validateSlots();
      const oldName = slot.__slotName;
      const name = this._nameForSlot(slot);
      if (name === oldName) {
        return;
      }
      // remove from existing tracking
      let slots = this._slotMap[oldName];
      const i = slots.indexOf(slot);
      if (i >= 0) {
        slots.splice(i, 1);
      }
      // add to new location and sort if nedessary
      let list = this._slotMap[name] || (this._slotMap[name] = []);
      list.push(slot);
      if (list.length > 1) {
        this._slotMap[name] = this._sortSlots(list);
      }
    }

    _removeFlattenedNodes(slot) {
      const data = shadyDataForNode(slot);
      let n$ = data.flattenedNodes;
      if (n$) {
        for (let i=0; i<n$.length; i++) {
          let node = n$[i];
          let parent = parentNode$3(node);
          if (parent) {
            removeChild.call(parent, node);
          }
        }
      }
      data.flattenedNodes = [];
      data.assignedNodes = [];
    }

    _hasInsertionPoint() {
      this._validateSlots();
      return Boolean(this._slotList && this._slotList.length);
    }
  }

  /**
    Implements a pared down version of ShadowDOM's scoping, which is easy to
    polyfill across browsers.
  */
  function attachShadow(host, options) {
    if (!host) {
      throw 'Must provide a host.';
    }
    if (!options) {
      throw 'Not enough arguments.'
    }
    return new ShadyRoot(ShadyRootConstructionToken, host, options);
  }

  // Mitigate connect/disconnect spam by wrapping custom element classes.
  if (window['customElements'] && settings.inUse) {

    // process connect/disconnect after roots have rendered to avoid
    // issues with reaction stack.
    let connectMap = new Map();
    rootRendered = function() {
      // allow elements to connect
      const map = Array.from(connectMap);
      connectMap.clear();
      for (const [e, value] of map) {
        if (value) {
          e.__shadydom_connectedCallback();
        } else {
          e.__shadydom_disconnectedCallback();
        }
      }
    };

    // Document is in loading state and flag is set (deferConnectionCallbacks)
    // so process connection stack when `readystatechange` fires.
    if (isRendering) {
      document.addEventListener('readystatechange', () => {
        isRendering = false;
        rootRendered();
      }, {once: true});
    }

    /*
     * (1) elements can only be connected/disconnected if they are in the expected
     * state.
     * (2) never run connect/disconnect during rendering to avoid reaction stack issues.
     */
    const ManageConnect = (base, connected, disconnected) => {
      let counter = 0;
      const connectFlag = `__isConnected${counter++}`;
      if (connected || disconnected) {

        base.prototype.connectedCallback = base.prototype.__shadydom_connectedCallback = function() {
          // if rendering defer connected
          // otherwise connect only if we haven't already
          if (isRendering) {
            connectMap.set(this, true);
          } else if (!this[connectFlag]) {
            this[connectFlag] = true;
            if (connected) {
              connected.call(this);
            }
          }
        };

        base.prototype.disconnectedCallback = base.prototype.__shadydom_disconnectedCallback = function() {
          // if rendering, cancel a pending connection and queue disconnect,
          // otherwise disconnect only if a connection has been allowed
          if (isRendering) {
            // This is necessary only because calling removeChild
            // on a node that requires distribution leaves it in the DOM tree
            // until distribution.
            // NOTE: remember this is checking the patched isConnected to determine
            // if the node is in the logical tree.
            if (!this.isConnected) {
              connectMap.set(this, false);
            }
          } else if (this[connectFlag]) {
            this[connectFlag] = false;
            if (disconnected) {
              disconnected.call(this);
            }
          }
        };
      }

      return base;
    };

    const define = window['customElements']['define'];
    // NOTE: Instead of patching customElements.define,
    // re-define on the CustomElementRegistry.prototype.define
    // for Safari 10 compatibility (it's flakey otherwise).
    Object.defineProperty(window['CustomElementRegistry'].prototype, 'define', {
      value: function(name, constructor) {
        const connected = constructor.prototype.connectedCallback;
        const disconnected = constructor.prototype.disconnectedCallback;
        define.call(window['customElements'], name,
            ManageConnect(constructor, connected, disconnected));
        // unpatch connected/disconnected on class; custom elements tears this off
        // so the patch is maintained, but if the user calls these methods for
        // e.g. testing, they will be as expected.
        constructor.prototype.connectedCallback = connected;
        constructor.prototype.disconnectedCallback = disconnected;
      }
    });

  }

  /**
  @license
  Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
  This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
  The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
  The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
  Code distributed by Google as part of the polymer project is also
  subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
  */

  function getAssignedSlot(node) {
    renderRootNode(node);
    const nodeData = shadyDataForNode(node);
    return nodeData && nodeData.assignedSlot || null;
  }

  let windowMixin = {

    // NOTE: ensure these methods are bound to `window` so that `this` is correct
    // when called directly from global context without a receiver; e.g.
    // `addEventListener(...)`.
    addEventListener: addEventListener$1.bind(window),

    removeEventListener: removeEventListener$1.bind(window)

  };

  let nodeMixin = {

    addEventListener: addEventListener$1,

    removeEventListener: removeEventListener$1,

    appendChild(node) {
      return insertBefore$1(this, node);
    },

    insertBefore(node, ref_node) {
      return insertBefore$1(this, node, ref_node);
    },

    removeChild(node) {
      return removeChild$1(this, node);
    },

    /**
     * @this {Node}
     */
    replaceChild(node, ref_node) {
      insertBefore$1(this, node, ref_node);
      removeChild$1(this, ref_node);
      return node;
    },

    /**
     * @this {Node}
     */
    cloneNode(deep) {
      return cloneNode$1(this, deep);
    },

    /**
     * @this {Node}
     */
    getRootNode(options) {
      return getRootNode(this, options);
    },

    contains(node) {
      return contains(this, node);
    },

    /**
     * @this {Node}
     */
    dispatchEvent(event) {
      flush();
      return dispatchEvent.call(this, event);
    }

  };

  // NOTE: we can do this regardless of the browser supporting native accessors
  // since this is always "new" in that case.
  Object.defineProperties(nodeMixin, IsConnectedAccessor);

  // NOTE: For some reason 'Text' redefines 'assignedSlot'
  let textMixin = {
    /**
     * @this {Text}
     */
    get assignedSlot() {
      return getAssignedSlot(this);
    }
  };

  let fragmentMixin = {

    // TODO(sorvell): consider doing native QSA and filtering results.
    /**
     * @this {DocumentFragment}
     */
    querySelector(selector) {
      // match selector and halt on first result.
      let result = query(this, function(n) {
        return matchesSelector(n, selector);
      }, function(n) {
        return Boolean(n);
      })[0];
      return result || null;
    },

    /**
     * @this {DocumentFragment}
     */
    // TODO(sorvell): `useNative` option relies on native querySelectorAll and
    // misses distributed nodes, see
    // https://github.com/webcomponents/shadydom/pull/210#issuecomment-361435503
    querySelectorAll(selector, useNative) {
      if (useNative) {
        const o = Array.prototype.slice.call(querySelectorAll.call(this, selector));
        const root = this.getRootNode();
        return o.filter(e => e.getRootNode() == root);
      }
      return query(this, function(n) {
        return matchesSelector(n, selector);
      });
    }

  };

  let slotMixin = {

    /**
     * @this {HTMLSlotElement}
     */
    assignedNodes(options) {
      if (this.localName === 'slot') {
        renderRootNode(this);
        const nodeData = shadyDataForNode(this);
        return nodeData ?
          ((options && options.flatten ? nodeData.flattenedNodes :
            nodeData.assignedNodes) || []) :
          [];
      }
    }

  };

  let elementMixin = extendAll({

    /**
     * @this {HTMLElement}
     */
    setAttribute(name, value) {
      setAttribute$1(this, name, value);
    },

    /**
     * @this {HTMLElement}
     */
    removeAttribute(name) {
      removeAttribute$1(this, name);
    },

    /**
     * @this {HTMLElement}
     */
    attachShadow(options) {
      return attachShadow(this, options);
    },

    /**
     * @this {HTMLElement}
     */
    get slot() {
      return this.getAttribute('slot');
    },

    /**
     * @this {HTMLElement}
     */
    set slot(value) {
      setAttribute$1(this, 'slot', value);
    },

    /**
     * @this {HTMLElement}
     */
    get assignedSlot() {
      return getAssignedSlot(this);
    }

  }, fragmentMixin, slotMixin);

  Object.defineProperties(elementMixin, ShadowRootAccessor);

  let documentMixin = extendAll({
    /**
     * @this {Document}
     */
    importNode(node, deep) {
      return importNode$1(node, deep);
    },

    /**
     * @this {Document}
     */
    getElementById(id) {
      let result = query(this, function(n) {
        return n.id == id;
      }, function(n) {
        return Boolean(n);
      })[0];
      return result || null;
    }

  }, fragmentMixin);

  Object.defineProperties(documentMixin, {
    '_activeElement': ActiveElementAccessor.activeElement
  });

  let nativeBlur = HTMLElement.prototype.blur;

  let htmlElementMixin = {
    /**
     * @this {HTMLElement}
     */
    blur() {
      const nodeData = shadyDataForNode(this);
      let root = nodeData && nodeData.root;
      let shadowActive = root && root.activeElement;
      if (shadowActive) {
        shadowActive.blur();
      } else {
        nativeBlur.call(this);
      }
    }
  };

  for (const property of Object.getOwnPropertyNames(Document.prototype)) {
    if (property.substring(0,2) === 'on') {
      Object.defineProperty(htmlElementMixin, property, {
        /** @this {HTMLElement} */
        set: function(fn) {
          const shadyData = ensureShadyDataForNode(this);
          const eventName = property.substring(2);
          shadyData.__onCallbackListeners[property] && this.removeEventListener(eventName, shadyData.__onCallbackListeners[property]);
          this.addEventListener(eventName, fn, {});
          shadyData.__onCallbackListeners[property] = fn;
        },
        /** @this {HTMLElement} */
        get() {
          const shadyData = shadyDataForNode(this);
          return shadyData && shadyData.__onCallbackListeners[property];
        },
        configurable: true
      });
    }
  }

  const shadowRootMixin = {
    /**
     * @this {ShadowRoot}
     */
    addEventListener(type, fn, optionsOrCapture) {
      if (typeof optionsOrCapture !== 'object') {
        optionsOrCapture = {
          capture: Boolean(optionsOrCapture)
        };
      }
      optionsOrCapture.__shadyTarget = this;
      this.host.addEventListener(type, fn, optionsOrCapture);
    },

    /**
     * @this {ShadowRoot}
     */
    removeEventListener(type, fn, optionsOrCapture) {
      if (typeof optionsOrCapture !== 'object') {
        optionsOrCapture = {
          capture: Boolean(optionsOrCapture)
        };
      }
      optionsOrCapture.__shadyTarget = this;
      this.host.removeEventListener(type, fn, optionsOrCapture);
    },

    /**
     * @this {ShadowRoot}
     */
    getElementById(id) {
      let result = query(this, function(n) {
        return n.id == id;
      }, function(n) {
        return Boolean(n);
      })[0];
      return result || null;
    }
  };

  function patchBuiltin(proto, obj) {
    let n$ = Object.getOwnPropertyNames(obj);
    for (let i=0; i < n$.length; i++) {
      let n = n$[i];
      let d = Object.getOwnPropertyDescriptor(obj, n);
      // NOTE: we prefer writing directly here because some browsers
      // have descriptors that are writable but not configurable (e.g.
      // `appendChild` on older browsers)
      if (d.value) {
        proto[n] = d.value;
      } else {
        Object.defineProperty(proto, n, d);
      }
    }
  }

  // Apply patches to builtins (e.g. Element.prototype). Some of these patches
  // can be done unconditionally (mostly methods like
  // `Element.prototype.appendChild`) and some can only be done when the browser
  // has proper descriptors on the builtin prototype
  // (e.g. `Element.prototype.firstChild`)`. When descriptors are not available,
  // elements are individually patched when needed (see e.g.
  // `patchInside/OutsideElementAccessors` in `patch-accessors.js`).
  function patchBuiltins() {
    let nativeHTMLElement =
      (window['customElements'] && window['customElements']['nativeHTMLElement']) ||
      HTMLElement;
    // These patches can always be done, for all supported browsers.
    patchBuiltin(ShadyRoot.prototype, shadowRootMixin);
    patchBuiltin(window.Node.prototype, nodeMixin);
    patchBuiltin(window.Window.prototype, windowMixin);
    patchBuiltin(window.Text.prototype, textMixin);
    patchBuiltin(window.DocumentFragment.prototype, fragmentMixin);
    patchBuiltin(window.Element.prototype, elementMixin);
    patchBuiltin(window.Document.prototype, documentMixin);
    if (window.HTMLSlotElement) {
      patchBuiltin(window.HTMLSlotElement.prototype, slotMixin);
    }
    patchBuiltin(nativeHTMLElement.prototype, htmlElementMixin);
    // These patches can *only* be done
    // on browsers that have proper property descriptors on builtin prototypes.
    // This includes: IE11, Edge, Chrome >= 4?; Safari >= 10, Firefox
    // On older browsers (Chrome <= 4?, Safari 9), a per element patching
    // strategy is used for patching accessors.
    if (settings.hasDescriptors) {
      patchAccessors(window.Node.prototype);
      patchAccessors(window.Text.prototype);
      patchAccessors(window.DocumentFragment.prototype);
      patchAccessors(window.Element.prototype);
      patchAccessors(nativeHTMLElement.prototype);
      patchAccessors(window.Document.prototype);
      if (window.HTMLSlotElement) {
        patchAccessors(window.HTMLSlotElement.prototype);
      }
    }
    patchShadowRootAccessors(ShadyRoot.prototype);
  }

  /**
  @license
  Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
  This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
  The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
  The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
  Code distributed by Google as part of the polymer project is also
  subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
  */

  if (settings.inUse) {
    let ShadyDOM = {
      // TODO(sorvell): remove when Polymer does not depend on this.
      'inUse': settings.inUse,
      // NOTE: old browsers without prototype accessors (very old Chrome
      // and Safari) need manually patched accessors to properly set
      // `innerHTML` and `textContent` when an element is:
      // (1) inside a shadowRoot
      // (2) does not have special (slot) children itself
      // (3) and setting the property needs to provoke distribution (because
      // a nested slot is added/removed)
      'patch': (node) => {
        patchInsideElementAccessors(node);
        patchOutsideElementAccessors(node);
        return node;
      },
      'isShadyRoot': isShadyRoot,
      'enqueue': enqueue,
      'flush': flush,
      'settings': settings,
      'filterMutations': filterMutations,
      'observeChildren': observeChildren,
      'unobserveChildren': unobserveChildren,
      'nativeMethods': nativeMethods,
      'nativeTree': accessors,
      // Set to true to defer native custom elements connection until the
      // document has fully parsed. This enables custom elements that create
      // shadowRoots to be defined while the document is loading. Elements
      // customized as they are created by the parser will successfully
      // render with this flag on.
      'deferConnectionCallbacks': settings['deferConnectionCallbacks'],
      // Integration point with ShadyCSS to disable styling MutationObserver,
      // as ShadyDOM will now handle dynamic scoping.
      'handlesDynamicScoping': true
    };

    window['ShadyDOM'] = ShadyDOM;

    // Apply patches to events...
    patchEvents();
    // Apply patches to builtins (e.g. Element.prototype) where applicable.
    patchBuiltins();

    window.ShadowRoot = ShadyRoot;
  }

}());
//# sourceMappingURL=shadydom.min.js.map
