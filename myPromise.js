(function(global, factory) {
    factory();
})(this, function() {
    function noop() {};

    function bind(fn, context) {
        fn.call(context);
    }

    /**
     * 思路：核心思路是如何在父Prom解决或拒绝之后改变子Prom的状态，函数复用达到了极致，通过参数优化以及合理的分支判断，达到函数的复用，根据Promises/A+规范处理边界情况
     * @param {String} promise._state 当前状态
     * @param {any} promise._value 回调返回值或resolve的参数
     * @param {Boolean} promise._handled 处理错误
     * @param {Array} promise._deferreds 延迟对象，promise: 返回的新的Prom，当前Prom的执行态回调和拒绝态回调 {onFulfilled, onRejected, promise}
     * {Function} _immediateFn 异步处理
     * {Function} Wraper 封装延迟对象 return {onFulfilled, onRejected, promise}
     * {Function} handle 重点，根据不同状态处理处理不同逻辑，如果为等待态，则保存延迟对象；如果为执行态或拒绝态，则处理相应回调并根据不同状态处理nextProm；特殊态：如果回调返回或resolve入参为Prom类型或类Prom(有zhen方法)，则以它的状态来处理父Prom的行为
     * {Function} resolve 更改传入Prom为执行态，并处理当前Prom
     * {Function} reject 更改传入Prom为拒绝态，并处理当前Prom
     * {Function} finale 接受Prom为参数，处理其回调
     * {Function} doResolve 处理顶层Prom回调(同步执行), 并传入封装后的resolve方法
     * {Boolean} done 根据Promises/A+规范，执行态和拒绝态不能迁移至其他任何状态，且只存在一个不可变的终止，所以done用来防止用户多次调用
     */
    function MyPromise(fn) {
        this._state = 'Pending'; // 等待态（Pending）、执行态（Fulfilled）和拒绝态（Rejected）, 特殊态（Waiting）
        this._value = undefined;
        this._handled = false;
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

    MyPromise.prototype.finally = function(finaled) {
        var constructor = this.constructor;
        return this.then(
            function(value) {
                return constructor.resolve(finaled()).then(function() {
                    //返回值用于把父Prom的结果存到当前的Prom中，后面会接着向下传递
                    return value;
                });
            },
            function(reason) {
                return constructor.resolve(finaled()).then(function() {
                    //返回值用于把父Prom的结果存到当前的Prom中，后面会接着向下传递
                    return constructor.reject(reason);
                });
            }
        );
    }

    function Wraper(onFulfilled, onRejected, promise) {
        this.onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : null;
        this.onRejected = typeof onRejected === 'function' ? onRejected : null;
        this.promise = promise;
    }

    function handle (self, deferred) {
        while (self._state === 'Waiting') {
            self = self._value;
        }
        if (self._state === 'Pending') {
            self._deferreds.push(deferred);
            return;
        }
        //标志该Prom已经触发过回调了，如果初次触发回调出现异常，则需要直接抛出错，
        //如果触发过回调，错误信息向下传递，直到遇到catch;
        self._handled = true;

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
        try {
            if (self === newValue) {
                throw new TypeError('A promise cannot be resolved with itself.');
            }
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
        //如果调用回调失败，需要reject下一个Prom，且错误信息传递给它
        //如果下一个Prom有回调，则进行正常处理，如果没有回调，则需要直接抛出错误
        if (self._state === 'Rejected' && self._deferreds.length === 0) {
            MyPromise._immediateFn(function() {
                if (!self._handled) {
                    MyPromise._unhandledRejectionFn(self._value);
                }
            });
        }

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

    MyPromise._unhandledRejectionFn = function _unhandledRejectionFn(err) {
        if (typeof console !== 'undefined' && console) {
            console.warn('Possible Unhandled Promise Rejection:', err); // eslint-disable-line no-console
        }
    };

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
        return new MyPromise(function (resolve, reject) {
            reject(value);
        });
    }

    window.MyPromise = MyPromise;
})