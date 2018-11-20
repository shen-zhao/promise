function Mpromise(func) {
    var status = 'pending', //pending 进行中    fulfilled 已完成    rejected 已失败
        queue = [],
        value = null;

    this.then = function(onFulfilled) {
        new Mpromise(function(resolve) {
            handle({onFulfilled, resolve});
        });
    }

    function handle(deferred) {
        if(status === 'pending') {
            queue.push(deferred);
            return
        }
        var ret = deferred.onFulfilled(value);
        deferred.resolve(ret);
    }

    function resolve(ret) {
        status = 'fulfilled'
        value = ret;
        window.setTimeout(function() {
            queue.forEach((item) => {
                handle(item);
            });
        }, 0);
    }

    func(resolve);
}