'use strict';
suite('live childNodes consistency (issue 321)', function() {
  test('after child removal', function() {
    var a = document.createElement('a');
    var b = document.createElement('b');
     a.appendChild(b);
     var childNodes = a.childNodes;
    assert.equal(childNodes.length, 1);

    a.removeChild(b);
    assert.equal(a.childNodes.length, 0);
    assert.equal(childNodes.length, 0);
  });
  test('after child appended', function() {
    var node = document.createElement('a');
     var childNodes = node.childNodes;
    assert.equal(childNodes.length, 0);
     node.appendChild(document.createElement('b'));
    assert.equal(node.childNodes.length, 1);
    assert.equal(childNodes.length, 1);
  });
  test('after child inserted before', function() {
    var node = document.createElement('a');
    var child = document.createElement('b');

    node.appendChild(child);
     var childNodes = node.childNodes;
    assert.equal(childNodes.length, 1);
     var firstChild = document.createElement('c');
    node.insertBefore(firstChild, child);
    assert.equal(node.childNodes.length, 2);
    assert.equal(childNodes.length, 2);
    assert.equal(childNodes[0], node.childNodes[0]);
    assert.equal(childNodes[1], node.childNodes[1]);
    assert.equal(childNodes[0], firstChild);
    assert.equal(childNodes[1], child);
  });
  test('after textContent changed', function() {
    var node = document.createElement('a');
    var child = document.createElement('b');

    node.appendChild(child);
     var childNodes = node.childNodes;
    assert.equal(childNodes.length, 1);
    assert.equal(childNodes[0], child);
     node.textContent = 'text';
     assert.equal(node.childNodes.length, 1);
    assert.equal(childNodes.length, 1);
    assert.equal(node.childNodes[0], childNodes[0]);
    assert.notEqual(childNodes[0], child);
  });
  test('after innerHTML changed', function() {
    var node = document.createElement('a');
    var child = document.createElement('b');

    node.appendChild(child);
     var childNodes = node.childNodes;
    assert.equal(childNodes.length, 1);
    assert.equal(childNodes[0], child);
     node.innerHTML = '<span>test</span>';
     assert.equal(node.childNodes.length, 1);
    assert.equal(childNodes.length, 1);
    assert.equal(node.childNodes[0], childNodes[0]);
    assert.notEqual(childNodes[0], child);
  });
  test('after replaceChild', function() {
    var node = document.createElement('a');
    var child = document.createElement('b');

    node.appendChild(child);
     var childNodes = node.childNodes;
    assert.equal(childNodes.length, 1);
    assert.equal(childNodes[0], child);
     var newChild = document.createElement('c');
    node.replaceChild(newChild, child);
     assert.equal(node.childNodes.length, 1);
    assert.equal(childNodes.length, 1);
    assert.equal(node.childNodes[0], childNodes[0]);
    assert.notEqual(childNodes[0], child);
  });
});
