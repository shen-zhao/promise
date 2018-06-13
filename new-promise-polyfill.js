function Newpromise(fn) {
    this._state = 0;  //0: 进行中  1: 成功  2: 失败  3: then return Promise
    this._value = null;
    this._deferreds = [];

    this.then = function(onFulfilled, onRejected) {
        let prom = new this.constructor(noop);
        var hh = new Handle(onFulfilled, onRejected, prom);
        /*这里可以直接字面量
            {
                promise: prom,
                onFulfilled: onFulfilled,
                onRejected: onRejected
            }
        */
        handle(this, hh);
        return prom;
    }

    function handle(self, deferred) {
        while(self._state === 3) {
            self = self._value;
        }
        
        if(self._state === 0) {
            self._deferreds.push(deferred);
            return;
        }

        Newpromise._immediateFn(function() {
            let cb = self._state === 1 ? deferred.onFulfilled : deferred.onRejected;
            var ret;
            ret = cb(self._value);
            
            resolve(deferred.promise, ret);
        });

    }

    function Handle(onFulfilled, onRejected, promise) {
        this.onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : null;
        this.onRejected = typeof onRejected === 'function' ? onRejected : null;
        this.promise = promise;
    }

    function resolve(self, newValue) {
        if(newValue && (typeof newValue === 'function' || typeof newValue === 'object')) {
            var then = newValue.then;
            if(newValue instanceof Newpromise) {
                self._state = 3;
                self._value = newValue;
                finale(self);
                return;
            } else if(typeof then === 'function') {
                return;
            }
        }
        self._state = 1;
        self._value = newValue;
        finale(self);
    }

    function finale(self) {
        for (var i = 0, len = self._deferreds.length; i < len; i++) {
            handle(self, self._deferreds[i]);
        }
        self._deferreds = null;
    }

    function doResolve(fn, self) {
        fn(
            function(value) {
                resolve(self, value);
            }
        )
    }

    function noop() {}

    doResolve(fn, this);
}

Newpromise._immediateFn = (typeof setImmediate === 'function' && function(fn) {
    setImmediate(fn)
}) || function(fn) {
    setTimeout(fn);
}