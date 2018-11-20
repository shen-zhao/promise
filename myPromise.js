(function(global, factory) {
    factory();
})(this, function() {
    function noop() {};

    function bind(fn, context) {
        fn.call(context);
    }

    function MyPromise(fn) {
        this._state = 'Pending'; // 等待态（Pending）、执行态（Fulfilled）和拒绝态（Rejected）, 特殊态（Waiting）
        this._value = undefined;
        this._deferreds = [];

        doResolve(fn, this);
    }

    MyPromise._immediateFn =
        (typeof setImmediate === 'function' &&
            function (fn) {
                setImmediate(fn);
            }) ||
        function (fn) {
            setTimeout(fn, 0);
        };
    
    MyPromise.prototype.then = function(onFulfilled, onRejected) {
        var nextProm = new this.constructor(noop);

        handle(this, new Wraper(onFulfilled, onRejected, nextProm));

        return nextProm;
    }

    MyPromise.prototype.catch = function(onRejected) {
        return this.then(null, onRejected);
    }

    function Wraper(onFulfilled, onRejected, promise) {
        this.onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : null;
        this.onRejected = typeof onRejected === 'function' ? onRejected : null;
        this.promise = promise;
    }

    function handle (self, deferred) {
        if (self._state === 'Pending') {
            self._deferreds.push(deferred);
            return;
        }

        MyPromise._immediateFn(function() {
            var cb = self._state  === 'Fulfilled' ? deferred.onFulfilled : deferred.onRejected;
            if (cb === null) {
                (self._state  === 'Fulfilled' ? resolve : reject)(deferred.promise, self._value);
                return;
            }
            var ret;
            try {
                ret = cb(self._value);
            } catch (e) {
                reject(deferred.promise, e);
                return;
            }
            resolve(deferred.promise, ret);
        })
        
    }

    function resolve(self, newValue) {
        if (self === newValue) {
            throw new TypeError('A promise cannot be resolved with itself.');
        }
        try {
            if (newValue && (typeof newValue === 'object' || typeof newValue === 'function')) {
                var then = newValue.then;
                if (newValue instanceof MyPromise) {
                    self._state = 'Waiting';
                    self._value = newValue;
                    finale(self);
                    return 
                } else if (typeof then === 'function') {
                    doResolve(bind(then), newValue);
                    return;
                }
            }

            self._state = 'Fulfilled';
            self._value = newValue;
            finale(self)
        } catch(e) {
            reject(self, e);
        }
    }

    function reject(self, newValue) {
        self._state = 'Rejected';
        self._value = newValue;
        finale(self)
    }

    function finale(self) {
        for (var i = 0; i < self._deferreds.length; i++) {
            handle(self, self._deferreds[i]);
        }

        self._deferreds = null;
    }

    function doResolve(fn, self) {
        var done = false;
        try {
            fn(
                function(value) {
                    if (done) return;
                    done = true;
                    resolve(self, value);
                },
                function(reason) {
                    if (done) return;
                    done = true;
                    reject(self, reason);
                }
            )
        } catch (e) {
            if (done) return;
            done = true;
            reject(self, e);
        }
    }

    MyPromise.all = function(arr) {
        return new MyPromise(function(resolve, reject) {
            if (!arr || typeof arr.length !== 'number') throw new TypeError('Promise.all accepts an array');

            var args = Array.prototype.slice.call(arr);
            var argsLen = args.length;

            if (argsLen === 0) return resolve([]);

            function res(i, val) {
                try {
                    if (val && (typeof val === 'object' || typeof val === 'function')) {
                        var then = val.then();
                        if (typeof then === 'function') {
                            then.call(
                                val,
                                function(val) {
                                    res(i, val);
                                },
                                reject
                            );
                            return;
                        }
                    }
                    args[i] = val;

                    if (--argsLen === 0) {
                        resolve(args);
                    }
                } catch(e) {
                    reject(e);
                }
            }

            for (var i = 0; i < arr.length; i++) {
                res(i, arr[i]);
            }
        });
    }

    MyPromise.race = function(arr) {
        return new MyPromise(function (resolve, reject) {
            for (var i = 0, len = arr.length; i < len; i++) {
                arr[i].then(resolve, reject);
            }
        });
    }

    MyPromise.resolve = function(value) {
        if (value && typeof value === 'object' && value instanceof MyPromise) {
            return value;
        }

        return new MyPromise(function(resolve) {
            resolve(value);
        });
    }

    MyPromise.reject = function(value) {
        return new Promise(function (resolve, reject) {
            reject(value);
        });
    }

    window.MyPromise = MyPromise;
})