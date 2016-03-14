var Message = function(config){

    // config
    var self = this;
    var host = config.host || '127.0.0.1';
    var port = config.port || 5555;
    var nsp  = config.nsp  || 'shared';
    var debug = config.debug || false;

    // application vars
    var _from_broadcast = false;
    var _promise_res    = null;
    var _promise_rej    = null;

    // print log
    this.log = function(channel, msg){
        if(debug){
            msg = msg || '';
            console.log('<' + channel + '>', msg);
        }
    }
    this.err = function(msg){
        console.error('<error>', msg);
    }

    // get message info
    this.info = function(){
        return {
            host:   host,
            port:   port,
            nsp:    nsp,
            debug:  debug,
            socket: socket,
        }
    }

    // socket io
    var socket = io.connect('http://' + host + ':' + port + '/' + nsp);
    socket.on('connect', function(){
        self.log('connect');
    });
    socket.on('event', function(data){
        self.log('event', data);
    });
    socket.on('disconnect', function(){
        self.log('disconnect');
    });
    socket.on('update', function(msg){ // update variable
        //
        // {action: "update", varname: "a", value: 60}
        // {action: "update", funcname: "b", args: "['a', 'b']"}
        //
        self.log('update', msg);
        //try {
            _from_broadcast = true;
            if(msg.varname){
                self[msg.varname] = JSON.parse(msg.value);
            }
            else if(msg.funcname){
                self[msg.funcname] = self.proxy_fn(msg.funcname);
            }
            else {
                self.err('not support ' + msg);
            }
        //}
        //catch(err){
        //    self.err(err);
        //}
    });
    socket.on('return', function(msg){
        //
        // { action: 'return', value: '10' }
        // { action: 'return', error: true, message: 'abcde' }
        //
        self.log('return', msg);
        if(msg.value){
            _promise_res(JSON.parse(msg.value));
        }
        else {
            console.log(msg);
            _promise_rej(Error(msg.message));
        }
    });

    // proxy function
    this.proxy_fn = function(fn_name){
        return function(){
            // prepare argument
            var args = [];
            for(var i in arguments){
                args.push(arguments[i])
            }

            // call proxy function
            var _msg = {
                'action'  : 'call',
                'funcname': fn_name,
                'args'    : JSON.stringify(args),
            }
            self.log('call', _msg);
            socket.emit('call', _msg);

            return new Promise(function(resolve, reject){
                _promise_res = resolve;
                _promise_rej = reject;
            });
        }
    }

    // get param names
    // http://stackoverflow.com/a/9924463/466693
    this.get_param_names = function(func){
        // var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
        var STRIP_COMMENTS = /(\/\/.*$)|(\/\*[\s\S]*?\*\/)|(\s*=[^,\)]*(('(?:\\'|[^'\r\n])*')|("(?:\\"|[^"\r\n])*"))|(\s*=[^,\)]*))/mg;
        var ARGUMENT_NAMES = /([^\s,]+)/g;
        var fnStr = func.toString().replace(STRIP_COMMENTS, '');
        var result = fnStr.slice(fnStr.indexOf('(')+1, fnStr.indexOf(')')).match(ARGUMENT_NAMES);
        return result || [];
    }

    // handle change
    this.handle_change = function(change){
        // 
        // { type: "add",    object: Message, name: "a" }
        // { type: "update", object: Message, name: "a", oldValue: 10 }
        //
        var changed_value = change.object[change.name];
        if(_from_broadcast){
            _from_broadcast = false;
        }
        else {
            if(typeof changed_value == 'function'){
                // TODO experiment
                var params = self.get_param_names(changed_value);
                console.warn('function name: ', change.name);
                console.warn('function params: ', params);
            }
            else {
                var _msg = {
                    'action'  : 'update',
                    'varname' : change.name,
                    'value'   : JSON.stringify(changed_value),
                }
                self.log('updating', _msg);
                socket.emit('updating', _msg);
            }
        }
    }

    // start observe instance add / update
    Object.observe(this, function(changes){
        changes.forEach(function(change){
            self.handle_change(change);
        });
    });   

};
