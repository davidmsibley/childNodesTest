# childNodes Test

Taken from [webcomponentsjs PR #393](https://github.com/webcomponents/webcomponentsjs/pull/393), this
test checks for a live NodeList.

See [shadydom issue #270](https://github.com/webcomponents/shadydom/issues/270) for background.

## How to use
```
npm install
npm start
```

## How to develop/debug
Pull down [shadydom](https://github.com/webcomponents/shadydom) locally and `link`
```
git clone git@github.com:webcomponents/shadydom.git
cd shadydom
npm install
npm run build
npm run debug
npm link
```

Then, in this project, use the linked build
```
npm link @webcomponents/shadydom
```
