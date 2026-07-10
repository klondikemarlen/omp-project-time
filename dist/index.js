var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/graceful-fs/polyfills.js
var require_polyfills = __commonJS({
  "node_modules/graceful-fs/polyfills.js"(exports, module) {
    var constants = __require("constants");
    var origCwd = process.cwd;
    var cwd = null;
    var platform = process.env.GRACEFUL_FS_PLATFORM || process.platform;
    process.cwd = function() {
      if (!cwd)
        cwd = origCwd.call(process);
      return cwd;
    };
    try {
      process.cwd();
    } catch (er) {
    }
    if (typeof process.chdir === "function") {
      chdir = process.chdir;
      process.chdir = function(d) {
        cwd = null;
        chdir.call(process, d);
      };
      if (Object.setPrototypeOf) Object.setPrototypeOf(process.chdir, chdir);
    }
    var chdir;
    module.exports = patch;
    function patch(fs2) {
      if (constants.hasOwnProperty("O_SYMLINK") && process.version.match(/^v0\.6\.[0-2]|^v0\.5\./)) {
        patchLchmod(fs2);
      }
      if (!fs2.lutimes) {
        patchLutimes(fs2);
      }
      fs2.chown = chownFix(fs2.chown);
      fs2.fchown = chownFix(fs2.fchown);
      fs2.lchown = chownFix(fs2.lchown);
      fs2.chmod = chmodFix(fs2.chmod);
      fs2.fchmod = chmodFix(fs2.fchmod);
      fs2.lchmod = chmodFix(fs2.lchmod);
      fs2.chownSync = chownFixSync(fs2.chownSync);
      fs2.fchownSync = chownFixSync(fs2.fchownSync);
      fs2.lchownSync = chownFixSync(fs2.lchownSync);
      fs2.chmodSync = chmodFixSync(fs2.chmodSync);
      fs2.fchmodSync = chmodFixSync(fs2.fchmodSync);
      fs2.lchmodSync = chmodFixSync(fs2.lchmodSync);
      fs2.stat = statFix(fs2.stat);
      fs2.fstat = statFix(fs2.fstat);
      fs2.lstat = statFix(fs2.lstat);
      fs2.statSync = statFixSync(fs2.statSync);
      fs2.fstatSync = statFixSync(fs2.fstatSync);
      fs2.lstatSync = statFixSync(fs2.lstatSync);
      if (fs2.chmod && !fs2.lchmod) {
        fs2.lchmod = function(path4, mode, cb) {
          if (cb) process.nextTick(cb);
        };
        fs2.lchmodSync = function() {
        };
      }
      if (fs2.chown && !fs2.lchown) {
        fs2.lchown = function(path4, uid, gid, cb) {
          if (cb) process.nextTick(cb);
        };
        fs2.lchownSync = function() {
        };
      }
      if (platform === "win32") {
        fs2.rename = typeof fs2.rename !== "function" ? fs2.rename : (function(fs$rename) {
          function rename2(from, to, cb) {
            var start = Date.now();
            var backoff = 0;
            fs$rename(from, to, function CB(er) {
              if (er && (er.code === "EACCES" || er.code === "EPERM" || er.code === "EBUSY") && Date.now() - start < 6e4) {
                setTimeout(function() {
                  fs2.stat(to, function(stater, st) {
                    if (stater && stater.code === "ENOENT")
                      fs$rename(from, to, CB);
                    else
                      cb(er);
                  });
                }, backoff);
                if (backoff < 100)
                  backoff += 10;
                return;
              }
              if (cb) cb(er);
            });
          }
          if (Object.setPrototypeOf) Object.setPrototypeOf(rename2, fs$rename);
          return rename2;
        })(fs2.rename);
      }
      fs2.read = typeof fs2.read !== "function" ? fs2.read : (function(fs$read) {
        function read(fd, buffer, offset, length, position, callback_) {
          var callback;
          if (callback_ && typeof callback_ === "function") {
            var eagCounter = 0;
            callback = function(er, _, __) {
              if (er && er.code === "EAGAIN" && eagCounter < 10) {
                eagCounter++;
                return fs$read.call(fs2, fd, buffer, offset, length, position, callback);
              }
              callback_.apply(this, arguments);
            };
          }
          return fs$read.call(fs2, fd, buffer, offset, length, position, callback);
        }
        if (Object.setPrototypeOf) Object.setPrototypeOf(read, fs$read);
        return read;
      })(fs2.read);
      fs2.readSync = typeof fs2.readSync !== "function" ? fs2.readSync : /* @__PURE__ */ (function(fs$readSync) {
        return function(fd, buffer, offset, length, position) {
          var eagCounter = 0;
          while (true) {
            try {
              return fs$readSync.call(fs2, fd, buffer, offset, length, position);
            } catch (er) {
              if (er.code === "EAGAIN" && eagCounter < 10) {
                eagCounter++;
                continue;
              }
              throw er;
            }
          }
        };
      })(fs2.readSync);
      function patchLchmod(fs3) {
        fs3.lchmod = function(path4, mode, callback) {
          fs3.open(
            path4,
            constants.O_WRONLY | constants.O_SYMLINK,
            mode,
            function(err, fd) {
              if (err) {
                if (callback) callback(err);
                return;
              }
              fs3.fchmod(fd, mode, function(err2) {
                fs3.close(fd, function(err22) {
                  if (callback) callback(err2 || err22);
                });
              });
            }
          );
        };
        fs3.lchmodSync = function(path4, mode) {
          var fd = fs3.openSync(path4, constants.O_WRONLY | constants.O_SYMLINK, mode);
          var threw = true;
          var ret;
          try {
            ret = fs3.fchmodSync(fd, mode);
            threw = false;
          } finally {
            if (threw) {
              try {
                fs3.closeSync(fd);
              } catch (er) {
              }
            } else {
              fs3.closeSync(fd);
            }
          }
          return ret;
        };
      }
      function patchLutimes(fs3) {
        if (constants.hasOwnProperty("O_SYMLINK") && fs3.futimes) {
          fs3.lutimes = function(path4, at, mt, cb) {
            fs3.open(path4, constants.O_SYMLINK, function(er, fd) {
              if (er) {
                if (cb) cb(er);
                return;
              }
              fs3.futimes(fd, at, mt, function(er2) {
                fs3.close(fd, function(er22) {
                  if (cb) cb(er2 || er22);
                });
              });
            });
          };
          fs3.lutimesSync = function(path4, at, mt) {
            var fd = fs3.openSync(path4, constants.O_SYMLINK);
            var ret;
            var threw = true;
            try {
              ret = fs3.futimesSync(fd, at, mt);
              threw = false;
            } finally {
              if (threw) {
                try {
                  fs3.closeSync(fd);
                } catch (er) {
                }
              } else {
                fs3.closeSync(fd);
              }
            }
            return ret;
          };
        } else if (fs3.futimes) {
          fs3.lutimes = function(_a, _b, _c, cb) {
            if (cb) process.nextTick(cb);
          };
          fs3.lutimesSync = function() {
          };
        }
      }
      function chmodFix(orig) {
        if (!orig) return orig;
        return function(target, mode, cb) {
          return orig.call(fs2, target, mode, function(er) {
            if (chownErOk(er)) er = null;
            if (cb) cb.apply(this, arguments);
          });
        };
      }
      function chmodFixSync(orig) {
        if (!orig) return orig;
        return function(target, mode) {
          try {
            return orig.call(fs2, target, mode);
          } catch (er) {
            if (!chownErOk(er)) throw er;
          }
        };
      }
      function chownFix(orig) {
        if (!orig) return orig;
        return function(target, uid, gid, cb) {
          return orig.call(fs2, target, uid, gid, function(er) {
            if (chownErOk(er)) er = null;
            if (cb) cb.apply(this, arguments);
          });
        };
      }
      function chownFixSync(orig) {
        if (!orig) return orig;
        return function(target, uid, gid) {
          try {
            return orig.call(fs2, target, uid, gid);
          } catch (er) {
            if (!chownErOk(er)) throw er;
          }
        };
      }
      function statFix(orig) {
        if (!orig) return orig;
        return function(target, options, cb) {
          if (typeof options === "function") {
            cb = options;
            options = null;
          }
          function callback(er, stats) {
            if (stats) {
              if (stats.uid < 0) stats.uid += 4294967296;
              if (stats.gid < 0) stats.gid += 4294967296;
            }
            if (cb) cb.apply(this, arguments);
          }
          return options ? orig.call(fs2, target, options, callback) : orig.call(fs2, target, callback);
        };
      }
      function statFixSync(orig) {
        if (!orig) return orig;
        return function(target, options) {
          var stats = options ? orig.call(fs2, target, options) : orig.call(fs2, target);
          if (stats) {
            if (stats.uid < 0) stats.uid += 4294967296;
            if (stats.gid < 0) stats.gid += 4294967296;
          }
          return stats;
        };
      }
      function chownErOk(er) {
        if (!er)
          return true;
        if (er.code === "ENOSYS")
          return true;
        var nonroot = !process.getuid || process.getuid() !== 0;
        if (nonroot) {
          if (er.code === "EINVAL" || er.code === "EPERM")
            return true;
        }
        return false;
      }
    }
  }
});

// node_modules/graceful-fs/legacy-streams.js
var require_legacy_streams = __commonJS({
  "node_modules/graceful-fs/legacy-streams.js"(exports, module) {
    var Stream = __require("stream").Stream;
    module.exports = legacy;
    function legacy(fs2) {
      return {
        ReadStream,
        WriteStream
      };
      function ReadStream(path4, options) {
        if (!(this instanceof ReadStream)) return new ReadStream(path4, options);
        Stream.call(this);
        var self = this;
        this.path = path4;
        this.fd = null;
        this.readable = true;
        this.paused = false;
        this.flags = "r";
        this.mode = 438;
        this.bufferSize = 64 * 1024;
        options = options || {};
        var keys = Object.keys(options);
        for (var index = 0, length = keys.length; index < length; index++) {
          var key = keys[index];
          this[key] = options[key];
        }
        if (this.encoding) this.setEncoding(this.encoding);
        if (this.start !== void 0) {
          if ("number" !== typeof this.start) {
            throw TypeError("start must be a Number");
          }
          if (this.end === void 0) {
            this.end = Infinity;
          } else if ("number" !== typeof this.end) {
            throw TypeError("end must be a Number");
          }
          if (this.start > this.end) {
            throw new Error("start must be <= end");
          }
          this.pos = this.start;
        }
        if (this.fd !== null) {
          process.nextTick(function() {
            self._read();
          });
          return;
        }
        fs2.open(this.path, this.flags, this.mode, function(err, fd) {
          if (err) {
            self.emit("error", err);
            self.readable = false;
            return;
          }
          self.fd = fd;
          self.emit("open", fd);
          self._read();
        });
      }
      function WriteStream(path4, options) {
        if (!(this instanceof WriteStream)) return new WriteStream(path4, options);
        Stream.call(this);
        this.path = path4;
        this.fd = null;
        this.writable = true;
        this.flags = "w";
        this.encoding = "binary";
        this.mode = 438;
        this.bytesWritten = 0;
        options = options || {};
        var keys = Object.keys(options);
        for (var index = 0, length = keys.length; index < length; index++) {
          var key = keys[index];
          this[key] = options[key];
        }
        if (this.start !== void 0) {
          if ("number" !== typeof this.start) {
            throw TypeError("start must be a Number");
          }
          if (this.start < 0) {
            throw new Error("start must be >= zero");
          }
          this.pos = this.start;
        }
        this.busy = false;
        this._queue = [];
        if (this.fd === null) {
          this._open = fs2.open;
          this._queue.push([this._open, this.path, this.flags, this.mode, void 0]);
          this.flush();
        }
      }
    }
  }
});

// node_modules/graceful-fs/clone.js
var require_clone = __commonJS({
  "node_modules/graceful-fs/clone.js"(exports, module) {
    "use strict";
    module.exports = clone;
    var getPrototypeOf = Object.getPrototypeOf || function(obj) {
      return obj.__proto__;
    };
    function clone(obj) {
      if (obj === null || typeof obj !== "object")
        return obj;
      if (obj instanceof Object)
        var copy = { __proto__: getPrototypeOf(obj) };
      else
        var copy = /* @__PURE__ */ Object.create(null);
      Object.getOwnPropertyNames(obj).forEach(function(key) {
        Object.defineProperty(copy, key, Object.getOwnPropertyDescriptor(obj, key));
      });
      return copy;
    }
  }
});

// node_modules/graceful-fs/graceful-fs.js
var require_graceful_fs = __commonJS({
  "node_modules/graceful-fs/graceful-fs.js"(exports, module) {
    var fs2 = __require("fs");
    var polyfills = require_polyfills();
    var legacy = require_legacy_streams();
    var clone = require_clone();
    var util = __require("util");
    var gracefulQueue;
    var previousSymbol;
    if (typeof Symbol === "function" && typeof Symbol.for === "function") {
      gracefulQueue = /* @__PURE__ */ Symbol.for("graceful-fs.queue");
      previousSymbol = /* @__PURE__ */ Symbol.for("graceful-fs.previous");
    } else {
      gracefulQueue = "___graceful-fs.queue";
      previousSymbol = "___graceful-fs.previous";
    }
    function noop() {
    }
    function publishQueue(context, queue2) {
      Object.defineProperty(context, gracefulQueue, {
        get: function() {
          return queue2;
        }
      });
    }
    var debug = noop;
    if (util.debuglog)
      debug = util.debuglog("gfs4");
    else if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || ""))
      debug = function() {
        var m = util.format.apply(util, arguments);
        m = "GFS4: " + m.split(/\n/).join("\nGFS4: ");
        console.error(m);
      };
    if (!fs2[gracefulQueue]) {
      queue = global[gracefulQueue] || [];
      publishQueue(fs2, queue);
      fs2.close = (function(fs$close) {
        function close(fd, cb) {
          return fs$close.call(fs2, fd, function(err) {
            if (!err) {
              resetQueue();
            }
            if (typeof cb === "function")
              cb.apply(this, arguments);
          });
        }
        Object.defineProperty(close, previousSymbol, {
          value: fs$close
        });
        return close;
      })(fs2.close);
      fs2.closeSync = (function(fs$closeSync) {
        function closeSync(fd) {
          fs$closeSync.apply(fs2, arguments);
          resetQueue();
        }
        Object.defineProperty(closeSync, previousSymbol, {
          value: fs$closeSync
        });
        return closeSync;
      })(fs2.closeSync);
      if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || "")) {
        process.on("exit", function() {
          debug(fs2[gracefulQueue]);
          __require("assert").equal(fs2[gracefulQueue].length, 0);
        });
      }
    }
    var queue;
    if (!global[gracefulQueue]) {
      publishQueue(global, fs2[gracefulQueue]);
    }
    module.exports = patch(clone(fs2));
    if (process.env.TEST_GRACEFUL_FS_GLOBAL_PATCH && !fs2.__patched) {
      module.exports = patch(fs2);
      fs2.__patched = true;
    }
    function patch(fs3) {
      polyfills(fs3);
      fs3.gracefulify = patch;
      fs3.createReadStream = createReadStream;
      fs3.createWriteStream = createWriteStream;
      var fs$readFile = fs3.readFile;
      fs3.readFile = readFile2;
      function readFile2(path4, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        return go$readFile(path4, options, cb);
        function go$readFile(path5, options2, cb2, startTime) {
          return fs$readFile(path5, options2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$readFile, [path5, options2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$writeFile = fs3.writeFile;
      fs3.writeFile = writeFile2;
      function writeFile2(path4, data, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        return go$writeFile(path4, data, options, cb);
        function go$writeFile(path5, data2, options2, cb2, startTime) {
          return fs$writeFile(path5, data2, options2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$writeFile, [path5, data2, options2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$appendFile = fs3.appendFile;
      if (fs$appendFile)
        fs3.appendFile = appendFile;
      function appendFile(path4, data, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        return go$appendFile(path4, data, options, cb);
        function go$appendFile(path5, data2, options2, cb2, startTime) {
          return fs$appendFile(path5, data2, options2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$appendFile, [path5, data2, options2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$copyFile = fs3.copyFile;
      if (fs$copyFile)
        fs3.copyFile = copyFile;
      function copyFile(src, dest, flags, cb) {
        if (typeof flags === "function") {
          cb = flags;
          flags = 0;
        }
        return go$copyFile(src, dest, flags, cb);
        function go$copyFile(src2, dest2, flags2, cb2, startTime) {
          return fs$copyFile(src2, dest2, flags2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$copyFile, [src2, dest2, flags2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$readdir = fs3.readdir;
      fs3.readdir = readdir;
      var noReaddirOptionVersions = /^v[0-5]\./;
      function readdir(path4, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        var go$readdir = noReaddirOptionVersions.test(process.version) ? function go$readdir2(path5, options2, cb2, startTime) {
          return fs$readdir(path5, fs$readdirCallback(
            path5,
            options2,
            cb2,
            startTime
          ));
        } : function go$readdir2(path5, options2, cb2, startTime) {
          return fs$readdir(path5, options2, fs$readdirCallback(
            path5,
            options2,
            cb2,
            startTime
          ));
        };
        return go$readdir(path4, options, cb);
        function fs$readdirCallback(path5, options2, cb2, startTime) {
          return function(err, files) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([
                go$readdir,
                [path5, options2, cb2],
                err,
                startTime || Date.now(),
                Date.now()
              ]);
            else {
              if (files && files.sort)
                files.sort();
              if (typeof cb2 === "function")
                cb2.call(this, err, files);
            }
          };
        }
      }
      if (process.version.substr(0, 4) === "v0.8") {
        var legStreams = legacy(fs3);
        ReadStream = legStreams.ReadStream;
        WriteStream = legStreams.WriteStream;
      }
      var fs$ReadStream = fs3.ReadStream;
      if (fs$ReadStream) {
        ReadStream.prototype = Object.create(fs$ReadStream.prototype);
        ReadStream.prototype.open = ReadStream$open;
      }
      var fs$WriteStream = fs3.WriteStream;
      if (fs$WriteStream) {
        WriteStream.prototype = Object.create(fs$WriteStream.prototype);
        WriteStream.prototype.open = WriteStream$open;
      }
      Object.defineProperty(fs3, "ReadStream", {
        get: function() {
          return ReadStream;
        },
        set: function(val) {
          ReadStream = val;
        },
        enumerable: true,
        configurable: true
      });
      Object.defineProperty(fs3, "WriteStream", {
        get: function() {
          return WriteStream;
        },
        set: function(val) {
          WriteStream = val;
        },
        enumerable: true,
        configurable: true
      });
      var FileReadStream = ReadStream;
      Object.defineProperty(fs3, "FileReadStream", {
        get: function() {
          return FileReadStream;
        },
        set: function(val) {
          FileReadStream = val;
        },
        enumerable: true,
        configurable: true
      });
      var FileWriteStream = WriteStream;
      Object.defineProperty(fs3, "FileWriteStream", {
        get: function() {
          return FileWriteStream;
        },
        set: function(val) {
          FileWriteStream = val;
        },
        enumerable: true,
        configurable: true
      });
      function ReadStream(path4, options) {
        if (this instanceof ReadStream)
          return fs$ReadStream.apply(this, arguments), this;
        else
          return ReadStream.apply(Object.create(ReadStream.prototype), arguments);
      }
      function ReadStream$open() {
        var that = this;
        open(that.path, that.flags, that.mode, function(err, fd) {
          if (err) {
            if (that.autoClose)
              that.destroy();
            that.emit("error", err);
          } else {
            that.fd = fd;
            that.emit("open", fd);
            that.read();
          }
        });
      }
      function WriteStream(path4, options) {
        if (this instanceof WriteStream)
          return fs$WriteStream.apply(this, arguments), this;
        else
          return WriteStream.apply(Object.create(WriteStream.prototype), arguments);
      }
      function WriteStream$open() {
        var that = this;
        open(that.path, that.flags, that.mode, function(err, fd) {
          if (err) {
            that.destroy();
            that.emit("error", err);
          } else {
            that.fd = fd;
            that.emit("open", fd);
          }
        });
      }
      function createReadStream(path4, options) {
        return new fs3.ReadStream(path4, options);
      }
      function createWriteStream(path4, options) {
        return new fs3.WriteStream(path4, options);
      }
      var fs$open = fs3.open;
      fs3.open = open;
      function open(path4, flags, mode, cb) {
        if (typeof mode === "function")
          cb = mode, mode = null;
        return go$open(path4, flags, mode, cb);
        function go$open(path5, flags2, mode2, cb2, startTime) {
          return fs$open(path5, flags2, mode2, function(err, fd) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$open, [path5, flags2, mode2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      return fs3;
    }
    function enqueue(elem) {
      debug("ENQUEUE", elem[0].name, elem[1]);
      fs2[gracefulQueue].push(elem);
      retry();
    }
    var retryTimer;
    function resetQueue() {
      var now = Date.now();
      for (var i = 0; i < fs2[gracefulQueue].length; ++i) {
        if (fs2[gracefulQueue][i].length > 2) {
          fs2[gracefulQueue][i][3] = now;
          fs2[gracefulQueue][i][4] = now;
        }
      }
      retry();
    }
    function retry() {
      clearTimeout(retryTimer);
      retryTimer = void 0;
      if (fs2[gracefulQueue].length === 0)
        return;
      var elem = fs2[gracefulQueue].shift();
      var fn = elem[0];
      var args = elem[1];
      var err = elem[2];
      var startTime = elem[3];
      var lastTime = elem[4];
      if (startTime === void 0) {
        debug("RETRY", fn.name, args);
        fn.apply(null, args);
      } else if (Date.now() - startTime >= 6e4) {
        debug("TIMEOUT", fn.name, args);
        var cb = args.pop();
        if (typeof cb === "function")
          cb.call(null, err);
      } else {
        var sinceAttempt = Date.now() - lastTime;
        var sinceStart = Math.max(lastTime - startTime, 1);
        var desiredDelay = Math.min(sinceStart * 1.2, 100);
        if (sinceAttempt >= desiredDelay) {
          debug("RETRY", fn.name, args);
          fn.apply(null, args.concat([startTime]));
        } else {
          fs2[gracefulQueue].push(elem);
        }
      }
      if (retryTimer === void 0) {
        retryTimer = setTimeout(retry, 0);
      }
    }
  }
});

// node_modules/retry/lib/retry_operation.js
var require_retry_operation = __commonJS({
  "node_modules/retry/lib/retry_operation.js"(exports, module) {
    function RetryOperation(timeouts, options) {
      if (typeof options === "boolean") {
        options = { forever: options };
      }
      this._originalTimeouts = JSON.parse(JSON.stringify(timeouts));
      this._timeouts = timeouts;
      this._options = options || {};
      this._maxRetryTime = options && options.maxRetryTime || Infinity;
      this._fn = null;
      this._errors = [];
      this._attempts = 1;
      this._operationTimeout = null;
      this._operationTimeoutCb = null;
      this._timeout = null;
      this._operationStart = null;
      if (this._options.forever) {
        this._cachedTimeouts = this._timeouts.slice(0);
      }
    }
    module.exports = RetryOperation;
    RetryOperation.prototype.reset = function() {
      this._attempts = 1;
      this._timeouts = this._originalTimeouts;
    };
    RetryOperation.prototype.stop = function() {
      if (this._timeout) {
        clearTimeout(this._timeout);
      }
      this._timeouts = [];
      this._cachedTimeouts = null;
    };
    RetryOperation.prototype.retry = function(err) {
      if (this._timeout) {
        clearTimeout(this._timeout);
      }
      if (!err) {
        return false;
      }
      var currentTime = (/* @__PURE__ */ new Date()).getTime();
      if (err && currentTime - this._operationStart >= this._maxRetryTime) {
        this._errors.unshift(new Error("RetryOperation timeout occurred"));
        return false;
      }
      this._errors.push(err);
      var timeout = this._timeouts.shift();
      if (timeout === void 0) {
        if (this._cachedTimeouts) {
          this._errors.splice(this._errors.length - 1, this._errors.length);
          this._timeouts = this._cachedTimeouts.slice(0);
          timeout = this._timeouts.shift();
        } else {
          return false;
        }
      }
      var self = this;
      var timer = setTimeout(function() {
        self._attempts++;
        if (self._operationTimeoutCb) {
          self._timeout = setTimeout(function() {
            self._operationTimeoutCb(self._attempts);
          }, self._operationTimeout);
          if (self._options.unref) {
            self._timeout.unref();
          }
        }
        self._fn(self._attempts);
      }, timeout);
      if (this._options.unref) {
        timer.unref();
      }
      return true;
    };
    RetryOperation.prototype.attempt = function(fn, timeoutOps) {
      this._fn = fn;
      if (timeoutOps) {
        if (timeoutOps.timeout) {
          this._operationTimeout = timeoutOps.timeout;
        }
        if (timeoutOps.cb) {
          this._operationTimeoutCb = timeoutOps.cb;
        }
      }
      var self = this;
      if (this._operationTimeoutCb) {
        this._timeout = setTimeout(function() {
          self._operationTimeoutCb();
        }, self._operationTimeout);
      }
      this._operationStart = (/* @__PURE__ */ new Date()).getTime();
      this._fn(this._attempts);
    };
    RetryOperation.prototype.try = function(fn) {
      console.log("Using RetryOperation.try() is deprecated");
      this.attempt(fn);
    };
    RetryOperation.prototype.start = function(fn) {
      console.log("Using RetryOperation.start() is deprecated");
      this.attempt(fn);
    };
    RetryOperation.prototype.start = RetryOperation.prototype.try;
    RetryOperation.prototype.errors = function() {
      return this._errors;
    };
    RetryOperation.prototype.attempts = function() {
      return this._attempts;
    };
    RetryOperation.prototype.mainError = function() {
      if (this._errors.length === 0) {
        return null;
      }
      var counts = {};
      var mainError = null;
      var mainErrorCount = 0;
      for (var i = 0; i < this._errors.length; i++) {
        var error = this._errors[i];
        var message = error.message;
        var count = (counts[message] || 0) + 1;
        counts[message] = count;
        if (count >= mainErrorCount) {
          mainError = error;
          mainErrorCount = count;
        }
      }
      return mainError;
    };
  }
});

// node_modules/retry/lib/retry.js
var require_retry = __commonJS({
  "node_modules/retry/lib/retry.js"(exports) {
    var RetryOperation = require_retry_operation();
    exports.operation = function(options) {
      var timeouts = exports.timeouts(options);
      return new RetryOperation(timeouts, {
        forever: options && options.forever,
        unref: options && options.unref,
        maxRetryTime: options && options.maxRetryTime
      });
    };
    exports.timeouts = function(options) {
      if (options instanceof Array) {
        return [].concat(options);
      }
      var opts = {
        retries: 10,
        factor: 2,
        minTimeout: 1 * 1e3,
        maxTimeout: Infinity,
        randomize: false
      };
      for (var key in options) {
        opts[key] = options[key];
      }
      if (opts.minTimeout > opts.maxTimeout) {
        throw new Error("minTimeout is greater than maxTimeout");
      }
      var timeouts = [];
      for (var i = 0; i < opts.retries; i++) {
        timeouts.push(this.createTimeout(i, opts));
      }
      if (options && options.forever && !timeouts.length) {
        timeouts.push(this.createTimeout(i, opts));
      }
      timeouts.sort(function(a, b) {
        return a - b;
      });
      return timeouts;
    };
    exports.createTimeout = function(attempt, opts) {
      var random = opts.randomize ? Math.random() + 1 : 1;
      var timeout = Math.round(random * opts.minTimeout * Math.pow(opts.factor, attempt));
      timeout = Math.min(timeout, opts.maxTimeout);
      return timeout;
    };
    exports.wrap = function(obj, options, methods) {
      if (options instanceof Array) {
        methods = options;
        options = null;
      }
      if (!methods) {
        methods = [];
        for (var key in obj) {
          if (typeof obj[key] === "function") {
            methods.push(key);
          }
        }
      }
      for (var i = 0; i < methods.length; i++) {
        var method = methods[i];
        var original = obj[method];
        obj[method] = function retryWrapper(original2) {
          var op = exports.operation(options);
          var args = Array.prototype.slice.call(arguments, 1);
          var callback = args.pop();
          args.push(function(err) {
            if (op.retry(err)) {
              return;
            }
            if (err) {
              arguments[0] = op.mainError();
            }
            callback.apply(this, arguments);
          });
          op.attempt(function() {
            original2.apply(obj, args);
          });
        }.bind(obj, original);
        obj[method].options = options;
      }
    };
  }
});

// node_modules/retry/index.js
var require_retry2 = __commonJS({
  "node_modules/retry/index.js"(exports, module) {
    module.exports = require_retry();
  }
});

// node_modules/signal-exit/signals.js
var require_signals = __commonJS({
  "node_modules/signal-exit/signals.js"(exports, module) {
    module.exports = [
      "SIGABRT",
      "SIGALRM",
      "SIGHUP",
      "SIGINT",
      "SIGTERM"
    ];
    if (process.platform !== "win32") {
      module.exports.push(
        "SIGVTALRM",
        "SIGXCPU",
        "SIGXFSZ",
        "SIGUSR2",
        "SIGTRAP",
        "SIGSYS",
        "SIGQUIT",
        "SIGIOT"
        // should detect profiler and enable/disable accordingly.
        // see #21
        // 'SIGPROF'
      );
    }
    if (process.platform === "linux") {
      module.exports.push(
        "SIGIO",
        "SIGPOLL",
        "SIGPWR",
        "SIGSTKFLT",
        "SIGUNUSED"
      );
    }
  }
});

// node_modules/signal-exit/index.js
var require_signal_exit = __commonJS({
  "node_modules/signal-exit/index.js"(exports, module) {
    var process2 = global.process;
    var processOk = function(process3) {
      return process3 && typeof process3 === "object" && typeof process3.removeListener === "function" && typeof process3.emit === "function" && typeof process3.reallyExit === "function" && typeof process3.listeners === "function" && typeof process3.kill === "function" && typeof process3.pid === "number" && typeof process3.on === "function";
    };
    if (!processOk(process2)) {
      module.exports = function() {
        return function() {
        };
      };
    } else {
      assert = __require("assert");
      signals = require_signals();
      isWin = /^win/i.test(process2.platform);
      EE = __require("events");
      if (typeof EE !== "function") {
        EE = EE.EventEmitter;
      }
      if (process2.__signal_exit_emitter__) {
        emitter = process2.__signal_exit_emitter__;
      } else {
        emitter = process2.__signal_exit_emitter__ = new EE();
        emitter.count = 0;
        emitter.emitted = {};
      }
      if (!emitter.infinite) {
        emitter.setMaxListeners(Infinity);
        emitter.infinite = true;
      }
      module.exports = function(cb, opts) {
        if (!processOk(global.process)) {
          return function() {
          };
        }
        assert.equal(typeof cb, "function", "a callback must be provided for exit handler");
        if (loaded === false) {
          load();
        }
        var ev = "exit";
        if (opts && opts.alwaysLast) {
          ev = "afterexit";
        }
        var remove = function() {
          emitter.removeListener(ev, cb);
          if (emitter.listeners("exit").length === 0 && emitter.listeners("afterexit").length === 0) {
            unload();
          }
        };
        emitter.on(ev, cb);
        return remove;
      };
      unload = function unload2() {
        if (!loaded || !processOk(global.process)) {
          return;
        }
        loaded = false;
        signals.forEach(function(sig) {
          try {
            process2.removeListener(sig, sigListeners[sig]);
          } catch (er) {
          }
        });
        process2.emit = originalProcessEmit;
        process2.reallyExit = originalProcessReallyExit;
        emitter.count -= 1;
      };
      module.exports.unload = unload;
      emit = function emit2(event, code, signal) {
        if (emitter.emitted[event]) {
          return;
        }
        emitter.emitted[event] = true;
        emitter.emit(event, code, signal);
      };
      sigListeners = {};
      signals.forEach(function(sig) {
        sigListeners[sig] = function listener() {
          if (!processOk(global.process)) {
            return;
          }
          var listeners = process2.listeners(sig);
          if (listeners.length === emitter.count) {
            unload();
            emit("exit", null, sig);
            emit("afterexit", null, sig);
            if (isWin && sig === "SIGHUP") {
              sig = "SIGINT";
            }
            process2.kill(process2.pid, sig);
          }
        };
      });
      module.exports.signals = function() {
        return signals;
      };
      loaded = false;
      load = function load2() {
        if (loaded || !processOk(global.process)) {
          return;
        }
        loaded = true;
        emitter.count += 1;
        signals = signals.filter(function(sig) {
          try {
            process2.on(sig, sigListeners[sig]);
            return true;
          } catch (er) {
            return false;
          }
        });
        process2.emit = processEmit;
        process2.reallyExit = processReallyExit;
      };
      module.exports.load = load;
      originalProcessReallyExit = process2.reallyExit;
      processReallyExit = function processReallyExit2(code) {
        if (!processOk(global.process)) {
          return;
        }
        process2.exitCode = code || /* istanbul ignore next */
        0;
        emit("exit", process2.exitCode, null);
        emit("afterexit", process2.exitCode, null);
        originalProcessReallyExit.call(process2, process2.exitCode);
      };
      originalProcessEmit = process2.emit;
      processEmit = function processEmit2(ev, arg) {
        if (ev === "exit" && processOk(global.process)) {
          if (arg !== void 0) {
            process2.exitCode = arg;
          }
          var ret = originalProcessEmit.apply(this, arguments);
          emit("exit", process2.exitCode, null);
          emit("afterexit", process2.exitCode, null);
          return ret;
        } else {
          return originalProcessEmit.apply(this, arguments);
        }
      };
    }
    var assert;
    var signals;
    var isWin;
    var EE;
    var emitter;
    var unload;
    var emit;
    var sigListeners;
    var loaded;
    var load;
    var originalProcessReallyExit;
    var processReallyExit;
    var originalProcessEmit;
    var processEmit;
  }
});

// node_modules/proper-lockfile/lib/mtime-precision.js
var require_mtime_precision = __commonJS({
  "node_modules/proper-lockfile/lib/mtime-precision.js"(exports, module) {
    "use strict";
    var cacheSymbol = /* @__PURE__ */ Symbol();
    function probe(file, fs2, callback) {
      const cachedPrecision = fs2[cacheSymbol];
      if (cachedPrecision) {
        return fs2.stat(file, (err, stat) => {
          if (err) {
            return callback(err);
          }
          callback(null, stat.mtime, cachedPrecision);
        });
      }
      const mtime = new Date(Math.ceil(Date.now() / 1e3) * 1e3 + 5);
      fs2.utimes(file, mtime, mtime, (err) => {
        if (err) {
          return callback(err);
        }
        fs2.stat(file, (err2, stat) => {
          if (err2) {
            return callback(err2);
          }
          const precision = stat.mtime.getTime() % 1e3 === 0 ? "s" : "ms";
          Object.defineProperty(fs2, cacheSymbol, { value: precision });
          callback(null, stat.mtime, precision);
        });
      });
    }
    function getMtime(precision) {
      let now = Date.now();
      if (precision === "s") {
        now = Math.ceil(now / 1e3) * 1e3;
      }
      return new Date(now);
    }
    module.exports.probe = probe;
    module.exports.getMtime = getMtime;
  }
});

// node_modules/proper-lockfile/lib/lockfile.js
var require_lockfile = __commonJS({
  "node_modules/proper-lockfile/lib/lockfile.js"(exports, module) {
    "use strict";
    var path4 = __require("path");
    var fs2 = require_graceful_fs();
    var retry = require_retry2();
    var onExit = require_signal_exit();
    var mtimePrecision = require_mtime_precision();
    var locks = {};
    function getLockFile(file, options) {
      return options.lockfilePath || `${file}.lock`;
    }
    function resolveCanonicalPath(file, options, callback) {
      if (!options.realpath) {
        return callback(null, path4.resolve(file));
      }
      options.fs.realpath(file, callback);
    }
    function acquireLock(file, options, callback) {
      const lockfilePath = getLockFile(file, options);
      options.fs.mkdir(lockfilePath, (err) => {
        if (!err) {
          return mtimePrecision.probe(lockfilePath, options.fs, (err2, mtime, mtimePrecision2) => {
            if (err2) {
              options.fs.rmdir(lockfilePath, () => {
              });
              return callback(err2);
            }
            callback(null, mtime, mtimePrecision2);
          });
        }
        if (err.code !== "EEXIST") {
          return callback(err);
        }
        if (options.stale <= 0) {
          return callback(Object.assign(new Error("Lock file is already being held"), { code: "ELOCKED", file }));
        }
        options.fs.stat(lockfilePath, (err2, stat) => {
          if (err2) {
            if (err2.code === "ENOENT") {
              return acquireLock(file, { ...options, stale: 0 }, callback);
            }
            return callback(err2);
          }
          if (!isLockStale(stat, options)) {
            return callback(Object.assign(new Error("Lock file is already being held"), { code: "ELOCKED", file }));
          }
          removeLock(file, options, (err3) => {
            if (err3) {
              return callback(err3);
            }
            acquireLock(file, { ...options, stale: 0 }, callback);
          });
        });
      });
    }
    function isLockStale(stat, options) {
      return stat.mtime.getTime() < Date.now() - options.stale;
    }
    function removeLock(file, options, callback) {
      options.fs.rmdir(getLockFile(file, options), (err) => {
        if (err && err.code !== "ENOENT") {
          return callback(err);
        }
        callback();
      });
    }
    function updateLock(file, options) {
      const lock3 = locks[file];
      if (lock3.updateTimeout) {
        return;
      }
      lock3.updateDelay = lock3.updateDelay || options.update;
      lock3.updateTimeout = setTimeout(() => {
        lock3.updateTimeout = null;
        options.fs.stat(lock3.lockfilePath, (err, stat) => {
          const isOverThreshold = lock3.lastUpdate + options.stale < Date.now();
          if (err) {
            if (err.code === "ENOENT" || isOverThreshold) {
              return setLockAsCompromised(file, lock3, Object.assign(err, { code: "ECOMPROMISED" }));
            }
            lock3.updateDelay = 1e3;
            return updateLock(file, options);
          }
          const isMtimeOurs = lock3.mtime.getTime() === stat.mtime.getTime();
          if (!isMtimeOurs) {
            return setLockAsCompromised(
              file,
              lock3,
              Object.assign(
                new Error("Unable to update lock within the stale threshold"),
                { code: "ECOMPROMISED" }
              )
            );
          }
          const mtime = mtimePrecision.getMtime(lock3.mtimePrecision);
          options.fs.utimes(lock3.lockfilePath, mtime, mtime, (err2) => {
            const isOverThreshold2 = lock3.lastUpdate + options.stale < Date.now();
            if (lock3.released) {
              return;
            }
            if (err2) {
              if (err2.code === "ENOENT" || isOverThreshold2) {
                return setLockAsCompromised(file, lock3, Object.assign(err2, { code: "ECOMPROMISED" }));
              }
              lock3.updateDelay = 1e3;
              return updateLock(file, options);
            }
            lock3.mtime = mtime;
            lock3.lastUpdate = Date.now();
            lock3.updateDelay = null;
            updateLock(file, options);
          });
        });
      }, lock3.updateDelay);
      if (lock3.updateTimeout.unref) {
        lock3.updateTimeout.unref();
      }
    }
    function setLockAsCompromised(file, lock3, err) {
      lock3.released = true;
      if (lock3.updateTimeout) {
        clearTimeout(lock3.updateTimeout);
      }
      if (locks[file] === lock3) {
        delete locks[file];
      }
      lock3.options.onCompromised(err);
    }
    function lock2(file, options, callback) {
      options = {
        stale: 1e4,
        update: null,
        realpath: true,
        retries: 0,
        fs: fs2,
        onCompromised: (err) => {
          throw err;
        },
        ...options
      };
      options.retries = options.retries || 0;
      options.retries = typeof options.retries === "number" ? { retries: options.retries } : options.retries;
      options.stale = Math.max(options.stale || 0, 2e3);
      options.update = options.update == null ? options.stale / 2 : options.update || 0;
      options.update = Math.max(Math.min(options.update, options.stale / 2), 1e3);
      resolveCanonicalPath(file, options, (err, file2) => {
        if (err) {
          return callback(err);
        }
        const operation = retry.operation(options.retries);
        operation.attempt(() => {
          acquireLock(file2, options, (err2, mtime, mtimePrecision2) => {
            if (operation.retry(err2)) {
              return;
            }
            if (err2) {
              return callback(operation.mainError());
            }
            const lock3 = locks[file2] = {
              lockfilePath: getLockFile(file2, options),
              mtime,
              mtimePrecision: mtimePrecision2,
              options,
              lastUpdate: Date.now()
            };
            updateLock(file2, options);
            callback(null, (releasedCallback) => {
              if (lock3.released) {
                return releasedCallback && releasedCallback(Object.assign(new Error("Lock is already released"), { code: "ERELEASED" }));
              }
              unlock(file2, { ...options, realpath: false }, releasedCallback);
            });
          });
        });
      });
    }
    function unlock(file, options, callback) {
      options = {
        fs: fs2,
        realpath: true,
        ...options
      };
      resolveCanonicalPath(file, options, (err, file2) => {
        if (err) {
          return callback(err);
        }
        const lock3 = locks[file2];
        if (!lock3) {
          return callback(Object.assign(new Error("Lock is not acquired/owned by you"), { code: "ENOTACQUIRED" }));
        }
        lock3.updateTimeout && clearTimeout(lock3.updateTimeout);
        lock3.released = true;
        delete locks[file2];
        removeLock(file2, options, callback);
      });
    }
    function check(file, options, callback) {
      options = {
        stale: 1e4,
        realpath: true,
        fs: fs2,
        ...options
      };
      options.stale = Math.max(options.stale || 0, 2e3);
      resolveCanonicalPath(file, options, (err, file2) => {
        if (err) {
          return callback(err);
        }
        options.fs.stat(getLockFile(file2, options), (err2, stat) => {
          if (err2) {
            return err2.code === "ENOENT" ? callback(null, false) : callback(err2);
          }
          return callback(null, !isLockStale(stat, options));
        });
      });
    }
    function getLocks() {
      return locks;
    }
    onExit(() => {
      for (const file in locks) {
        const options = locks[file].options;
        try {
          options.fs.rmdirSync(getLockFile(file, options));
        } catch (e) {
        }
      }
    });
    module.exports.lock = lock2;
    module.exports.unlock = unlock;
    module.exports.check = check;
    module.exports.getLocks = getLocks;
  }
});

// node_modules/proper-lockfile/lib/adapter.js
var require_adapter = __commonJS({
  "node_modules/proper-lockfile/lib/adapter.js"(exports, module) {
    "use strict";
    var fs2 = require_graceful_fs();
    function createSyncFs(fs3) {
      const methods = ["mkdir", "realpath", "stat", "rmdir", "utimes"];
      const newFs = { ...fs3 };
      methods.forEach((method) => {
        newFs[method] = (...args) => {
          const callback = args.pop();
          let ret;
          try {
            ret = fs3[`${method}Sync`](...args);
          } catch (err) {
            return callback(err);
          }
          callback(null, ret);
        };
      });
      return newFs;
    }
    function toPromise(method) {
      return (...args) => new Promise((resolve, reject) => {
        args.push((err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        });
        method(...args);
      });
    }
    function toSync(method) {
      return (...args) => {
        let err;
        let result;
        args.push((_err, _result) => {
          err = _err;
          result = _result;
        });
        method(...args);
        if (err) {
          throw err;
        }
        return result;
      };
    }
    function toSyncOptions(options) {
      options = { ...options };
      options.fs = createSyncFs(options.fs || fs2);
      if (typeof options.retries === "number" && options.retries > 0 || options.retries && typeof options.retries.retries === "number" && options.retries.retries > 0) {
        throw Object.assign(new Error("Cannot use retries with the sync api"), { code: "ESYNC" });
      }
      return options;
    }
    module.exports = {
      toPromise,
      toSync,
      toSyncOptions
    };
  }
});

// node_modules/proper-lockfile/index.js
var require_proper_lockfile = __commonJS({
  "node_modules/proper-lockfile/index.js"(exports, module) {
    "use strict";
    var lockfile = require_lockfile();
    var { toPromise, toSync, toSyncOptions } = require_adapter();
    async function lock2(file, options) {
      const release = await toPromise(lockfile.lock)(file, options);
      return toPromise(release);
    }
    function lockSync(file, options) {
      const release = toSync(lockfile.lock)(file, toSyncOptions(options));
      return toSync(release);
    }
    function unlock(file, options) {
      return toPromise(lockfile.unlock)(file, options);
    }
    function unlockSync(file, options) {
      return toSync(lockfile.unlock)(file, toSyncOptions(options));
    }
    function check(file, options) {
      return toPromise(lockfile.check)(file, options);
    }
    function checkSync(file, options) {
      return toSync(lockfile.check)(file, toSyncOptions(options));
    }
    module.exports = lock2;
    module.exports.lock = lock2;
    module.exports.unlock = unlock;
    module.exports.lockSync = lockSync;
    module.exports.unlockSync = unlockSync;
    module.exports.check = check;
    module.exports.checkSync = checkSync;
  }
});

// src/billing/time-constants.ts
var MONTHS_PER_YEAR = 12;
var MINUTES_PER_HOUR = 60;
var SECONDS_PER_MINUTE = 60;
var MS_PER_SECOND = 1e3;
var MS_PER_MINUTE = SECONDS_PER_MINUTE * MS_PER_SECOND;
var MS_PER_HOUR = MINUTES_PER_HOUR * MS_PER_MINUTE;

// src/billing/active-window-ms.ts
function activeWindowMs(config) {
  return config.activeWindowMinutes * MS_PER_MINUTE;
}

// node_modules/big.js/big.mjs
var DP = 20;
var RM = 1;
var MAX_DP = 1e6;
var MAX_POWER = 1e6;
var NE = -7;
var PE = 21;
var STRICT = false;
var NAME = "[big.js] ";
var INVALID = NAME + "Invalid ";
var INVALID_DP = INVALID + "decimal places";
var INVALID_RM = INVALID + "rounding mode";
var DIV_BY_ZERO = NAME + "Division by zero";
var P = {};
var UNDEFINED = void 0;
var NUMERIC = /^-?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i;
function _Big_() {
  function Big2(n) {
    var x = this;
    if (!(x instanceof Big2)) {
      return n === UNDEFINED && arguments.length === 0 ? _Big_() : new Big2(n);
    }
    if (n instanceof Big2) {
      x.s = n.s;
      x.e = n.e;
      x.c = n.c.slice();
    } else {
      if (typeof n !== "string") {
        if (Big2.strict === true && typeof n !== "bigint") {
          throw TypeError(INVALID + "value");
        }
        n = n === 0 && 1 / n < 0 ? "-0" : String(n);
      }
      parse(x, n);
    }
    x.constructor = Big2;
  }
  Big2.prototype = P;
  Big2.DP = DP;
  Big2.RM = RM;
  Big2.NE = NE;
  Big2.PE = PE;
  Big2.strict = STRICT;
  Big2.roundDown = 0;
  Big2.roundHalfUp = 1;
  Big2.roundHalfEven = 2;
  Big2.roundUp = 3;
  return Big2;
}
function parse(x, n) {
  var e, i, nl;
  if (!NUMERIC.test(n)) {
    throw Error(INVALID + "number");
  }
  x.s = n.charAt(0) == "-" ? (n = n.slice(1), -1) : 1;
  if ((e = n.indexOf(".")) > -1) n = n.replace(".", "");
  if ((i = n.search(/e/i)) > 0) {
    if (e < 0) e = i;
    e += +n.slice(i + 1);
    n = n.substring(0, i);
  } else if (e < 0) {
    e = n.length;
  }
  nl = n.length;
  for (i = 0; i < nl && n.charAt(i) == "0"; ) ++i;
  if (i == nl) {
    x.c = [x.e = 0];
  } else {
    for (; nl > 0 && n.charAt(--nl) == "0"; ) ;
    x.e = e - i - 1;
    x.c = [];
    for (e = 0; i <= nl; ) x.c[e++] = +n.charAt(i++);
  }
  return x;
}
function round(x, sd, rm, more) {
  var xc = x.c;
  if (rm === UNDEFINED) rm = x.constructor.RM;
  if (rm !== 0 && rm !== 1 && rm !== 2 && rm !== 3) {
    throw Error(INVALID_RM);
  }
  if (sd < 1) {
    more = rm === 3 && (more || !!xc[0]) || sd === 0 && (rm === 1 && xc[0] >= 5 || rm === 2 && (xc[0] > 5 || xc[0] === 5 && (more || xc[1] !== UNDEFINED)));
    xc.length = 1;
    if (more) {
      x.e = x.e - sd + 1;
      xc[0] = 1;
    } else {
      xc[0] = x.e = 0;
    }
  } else if (sd < xc.length) {
    more = rm === 1 && xc[sd] >= 5 || rm === 2 && (xc[sd] > 5 || xc[sd] === 5 && (more || xc[sd + 1] !== UNDEFINED || xc[sd - 1] & 1)) || rm === 3 && (more || !!xc[0]);
    xc.length = sd;
    if (more) {
      for (; ++xc[--sd] > 9; ) {
        xc[sd] = 0;
        if (sd === 0) {
          ++x.e;
          xc.unshift(1);
          break;
        }
      }
    }
    for (sd = xc.length; !xc[--sd]; ) xc.pop();
  }
  return x;
}
function stringify(x, doExponential, isNonzero) {
  var e = x.e, s = x.c.join(""), n = s.length;
  if (doExponential) {
    s = s.charAt(0) + (n > 1 ? "." + s.slice(1) : "") + (e < 0 ? "e" : "e+") + e;
  } else if (e < 0) {
    for (; ++e; ) s = "0" + s;
    s = "0." + s;
  } else if (e > 0) {
    if (++e > n) {
      for (e -= n; e--; ) s += "0";
    } else if (e < n) {
      s = s.slice(0, e) + "." + s.slice(e);
    }
  } else if (n > 1) {
    s = s.charAt(0) + "." + s.slice(1);
  }
  return x.s < 0 && isNonzero ? "-" + s : s;
}
P.abs = function() {
  var x = new this.constructor(this);
  x.s = 1;
  return x;
};
P.cmp = function(y) {
  var isneg, x = this, xc = x.c, yc = (y = new x.constructor(y)).c, i = x.s, j = y.s, k = x.e, l = y.e;
  if (!xc[0] || !yc[0]) return !xc[0] ? !yc[0] ? 0 : -j : i;
  if (i != j) return i;
  isneg = i < 0;
  if (k != l) return k > l ^ isneg ? 1 : -1;
  j = (k = xc.length) < (l = yc.length) ? k : l;
  for (i = -1; ++i < j; ) {
    if (xc[i] != yc[i]) return xc[i] > yc[i] ^ isneg ? 1 : -1;
  }
  return k == l ? 0 : k > l ^ isneg ? 1 : -1;
};
P.div = function(y) {
  var x = this, Big2 = x.constructor, a = x.c, b = (y = new Big2(y)).c, k = x.s == y.s ? 1 : -1, dp = Big2.DP;
  if (dp !== ~~dp || dp < 0 || dp > MAX_DP) {
    throw Error(INVALID_DP);
  }
  if (!b[0]) {
    throw Error(DIV_BY_ZERO);
  }
  if (!a[0]) {
    y.s = k;
    y.c = [y.e = 0];
    return y;
  }
  var bl, bt, n, cmp, ri, bz = b.slice(), ai = bl = b.length, al = a.length, r = a.slice(0, bl), rl = r.length, q = y, qc = q.c = [], qi = 0, p = dp + (q.e = x.e - y.e) + 1;
  q.s = k;
  k = p < 0 ? 0 : p;
  bz.unshift(0);
  for (; rl++ < bl; ) r.push(0);
  do {
    for (n = 0; n < 10; n++) {
      if (bl != (rl = r.length)) {
        cmp = bl > rl ? 1 : -1;
      } else {
        for (ri = -1, cmp = 0; ++ri < bl; ) {
          if (b[ri] != r[ri]) {
            cmp = b[ri] > r[ri] ? 1 : -1;
            break;
          }
        }
      }
      if (cmp < 0) {
        for (bt = rl == bl ? b : bz; rl; ) {
          if (r[--rl] < bt[rl]) {
            ri = rl;
            for (; ri && !r[--ri]; ) r[ri] = 9;
            --r[ri];
            r[rl] += 10;
          }
          r[rl] -= bt[rl];
        }
        for (; !r[0]; ) r.shift();
      } else {
        break;
      }
    }
    qc[qi++] = cmp ? n : ++n;
    if (r[0] && cmp) r[rl] = a[ai] || 0;
    else r = [a[ai]];
  } while ((ai++ < al || r[0] !== UNDEFINED) && k--);
  if (!qc[0] && qi != 1) {
    qc.shift();
    q.e--;
    p--;
  }
  if (qi > p) round(q, p, Big2.RM, r[0] !== UNDEFINED);
  return q;
};
P.eq = function(y) {
  return this.cmp(y) === 0;
};
P.gt = function(y) {
  return this.cmp(y) > 0;
};
P.gte = function(y) {
  return this.cmp(y) > -1;
};
P.lt = function(y) {
  return this.cmp(y) < 0;
};
P.lte = function(y) {
  return this.cmp(y) < 1;
};
P.minus = P.sub = function(y) {
  var i, j, t, xlty, x = this, Big2 = x.constructor, a = x.s, b = (y = new Big2(y)).s;
  if (a != b) {
    y.s = -b;
    return x.plus(y);
  }
  var xc = x.c.slice(), xe = x.e, yc = y.c, ye = y.e;
  if (!xc[0] || !yc[0]) {
    if (yc[0]) {
      y.s = -b;
    } else if (xc[0]) {
      y = new Big2(x);
    } else {
      y.s = 1;
    }
    return y;
  }
  if (a = xe - ye) {
    if (xlty = a < 0) {
      a = -a;
      t = xc;
    } else {
      ye = xe;
      t = yc;
    }
    t.reverse();
    for (b = a; b--; ) t.push(0);
    t.reverse();
  } else {
    j = ((xlty = xc.length < yc.length) ? xc : yc).length;
    for (a = b = 0; b < j; b++) {
      if (xc[b] != yc[b]) {
        xlty = xc[b] < yc[b];
        break;
      }
    }
  }
  if (xlty) {
    t = xc;
    xc = yc;
    yc = t;
    y.s = -y.s;
  }
  if ((b = (j = yc.length) - (i = xc.length)) > 0) for (; b--; ) xc[i++] = 0;
  for (b = i; j > a; ) {
    if (xc[--j] < yc[j]) {
      for (i = j; i && !xc[--i]; ) xc[i] = 9;
      --xc[i];
      xc[j] += 10;
    }
    xc[j] -= yc[j];
  }
  for (; xc[--b] === 0; ) xc.pop();
  for (; xc[0] === 0; ) {
    xc.shift();
    --ye;
  }
  if (!xc[0]) {
    y.s = 1;
    xc = [ye = 0];
  }
  y.c = xc;
  y.e = ye;
  return y;
};
P.mod = function(y) {
  var ygtx, x = this, Big2 = x.constructor, a = x.s, b = (y = new Big2(y)).s;
  if (!y.c[0]) {
    throw Error(DIV_BY_ZERO);
  }
  x.s = y.s = 1;
  ygtx = y.cmp(x) == 1;
  x.s = a;
  y.s = b;
  if (ygtx) return new Big2(x);
  a = Big2.DP;
  b = Big2.RM;
  Big2.DP = Big2.RM = 0;
  x = x.div(y);
  Big2.DP = a;
  Big2.RM = b;
  return this.minus(x.times(y));
};
P.neg = function() {
  var x = new this.constructor(this);
  x.s = -x.s;
  return x;
};
P.plus = P.add = function(y) {
  var e, k, t, x = this, Big2 = x.constructor;
  y = new Big2(y);
  if (x.s != y.s) {
    y.s = -y.s;
    return x.minus(y);
  }
  var xe = x.e, xc = x.c, ye = y.e, yc = y.c;
  if (!xc[0] || !yc[0]) {
    if (!yc[0]) {
      if (xc[0]) {
        y = new Big2(x);
      } else {
        y.s = x.s;
      }
    }
    return y;
  }
  xc = xc.slice();
  if (e = xe - ye) {
    if (e > 0) {
      ye = xe;
      t = yc;
    } else {
      e = -e;
      t = xc;
    }
    t.reverse();
    for (; e--; ) t.push(0);
    t.reverse();
  }
  if (xc.length - yc.length < 0) {
    t = yc;
    yc = xc;
    xc = t;
  }
  e = yc.length;
  for (k = 0; e; xc[e] %= 10) k = (xc[--e] = xc[e] + yc[e] + k) / 10 | 0;
  if (k) {
    xc.unshift(k);
    ++ye;
  }
  for (e = xc.length; xc[--e] === 0; ) xc.pop();
  y.c = xc;
  y.e = ye;
  return y;
};
P.pow = function(n) {
  var x = this, one = new x.constructor("1"), y = one, isneg = n < 0;
  if (n !== ~~n || n < -MAX_POWER || n > MAX_POWER) {
    throw Error(INVALID + "exponent");
  }
  if (isneg) n = -n;
  for (; ; ) {
    if (n & 1) y = y.times(x);
    n >>= 1;
    if (!n) break;
    x = x.times(x);
  }
  return isneg ? one.div(y) : y;
};
P.prec = function(sd, rm) {
  if (sd !== ~~sd || sd < 1 || sd > MAX_DP) {
    throw Error(INVALID + "precision");
  }
  return round(new this.constructor(this), sd, rm);
};
P.round = function(dp, rm) {
  if (dp === UNDEFINED) dp = 0;
  else if (dp !== ~~dp || dp < -MAX_DP || dp > MAX_DP) {
    throw Error(INVALID_DP);
  }
  return round(new this.constructor(this), dp + this.e + 1, rm);
};
P.sqrt = function() {
  var r, c, t, x = this, Big2 = x.constructor, s = x.s, e = x.e, half = new Big2("0.5");
  if (!x.c[0]) return new Big2(x);
  if (s < 0) {
    throw Error(NAME + "No square root");
  }
  s = Math.sqrt(+stringify(x, true, true));
  if (s === 0 || s === 1 / 0) {
    c = x.c.join("");
    if (!(c.length + e & 1)) c += "0";
    s = Math.sqrt(c);
    e = ((e + 1) / 2 | 0) - (e < 0 || e & 1);
    r = new Big2((s == 1 / 0 ? "5e" : (s = s.toExponential()).slice(0, s.indexOf("e") + 1)) + e);
  } else {
    r = new Big2(s + "");
  }
  e = r.e + (Big2.DP += 4);
  do {
    t = r;
    r = half.times(t.plus(x.div(t)));
  } while (t.c.slice(0, e).join("") !== r.c.slice(0, e).join(""));
  return round(r, (Big2.DP -= 4) + r.e + 1, Big2.RM);
};
P.times = P.mul = function(y) {
  var c, x = this, Big2 = x.constructor, xc = x.c, yc = (y = new Big2(y)).c, a = xc.length, b = yc.length, i = x.e, j = y.e;
  y.s = x.s == y.s ? 1 : -1;
  if (!xc[0] || !yc[0]) {
    y.c = [y.e = 0];
    return y;
  }
  y.e = i + j;
  if (a < b) {
    c = xc;
    xc = yc;
    yc = c;
    j = a;
    a = b;
    b = j;
  }
  for (c = new Array(j = a + b); j--; ) c[j] = 0;
  for (i = b; i--; ) {
    b = 0;
    for (j = a + i; j > i; ) {
      b = c[j] + yc[i] * xc[j - i - 1] + b;
      c[j--] = b % 10;
      b = b / 10 | 0;
    }
    c[j] = b;
  }
  if (b) ++y.e;
  else c.shift();
  for (i = c.length; !c[--i]; ) c.pop();
  y.c = c;
  return y;
};
P.toExponential = function(dp, rm) {
  var x = this, n = x.c[0];
  if (dp !== UNDEFINED) {
    if (dp !== ~~dp || dp < 0 || dp > MAX_DP) {
      throw Error(INVALID_DP);
    }
    x = round(new x.constructor(x), ++dp, rm);
    for (; x.c.length < dp; ) x.c.push(0);
  }
  return stringify(x, true, !!n);
};
P.toFixed = function(dp, rm) {
  var x = this, n = x.c[0];
  if (dp !== UNDEFINED) {
    if (dp !== ~~dp || dp < 0 || dp > MAX_DP) {
      throw Error(INVALID_DP);
    }
    x = round(new x.constructor(x), dp + x.e + 1, rm);
    for (dp = dp + x.e + 1; x.c.length < dp; ) x.c.push(0);
  }
  return stringify(x, false, !!n);
};
P.toJSON = P.toString = function() {
  var x = this, Big2 = x.constructor;
  return stringify(x, x.e <= Big2.NE || x.e >= Big2.PE, !!x.c[0]);
};
if (typeof Symbol !== "undefined") {
  P[/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")] = P.toJSON;
}
P.toNumber = function() {
  var n = +stringify(this, true, true);
  if (this.constructor.strict === true && !this.eq(n.toString())) {
    throw Error(NAME + "Imprecise conversion");
  }
  return n;
};
P.toPrecision = function(sd, rm) {
  var x = this, Big2 = x.constructor, n = x.c[0];
  if (sd !== UNDEFINED) {
    if (sd !== ~~sd || sd < 1 || sd > MAX_DP) {
      throw Error(INVALID + "precision");
    }
    x = round(new Big2(x), sd, rm);
    for (; x.c.length < sd; ) x.c.push(0);
  }
  return stringify(x, sd <= x.e || x.e <= Big2.NE || x.e >= Big2.PE, !!n);
};
P.valueOf = function() {
  var x = this, Big2 = x.constructor;
  if (Big2.strict === true) {
    throw Error(NAME + "valueOf disallowed");
  }
  return stringify(x, x.e <= Big2.NE || x.e >= Big2.PE, true);
};
var Big = _Big_();
var big_default = Big;

// src/billing/cost-for-active-ms.ts
function costForActiveMs(config, activeMs) {
  const annualSalary = big_default(config.monthlySalary).times(MONTHS_PER_YEAR);
  const annualMs = big_default(config.hoursPerWeek).times(config.weeksPerYear).times(MS_PER_HOUR);
  return annualSalary.times(activeMs).div(annualMs);
}

// src/billing/displayed-developer-cost.ts
function displayedDeveloperCost(state) {
  return big_default(state.totalCost);
}

// src/billing/empty-developer-cost-state.ts
function emptyDeveloperCostState() {
  return {
    totalCost: "0",
    promptCount: 0,
    activeMilliseconds: 0
  };
}

// src/billing/format-developer-cost.ts
function formatDeveloperCost(value) {
  return `$${value.toFixed(2)}`;
}

// src/billing/developer-cost-config-defaults.ts
var DEFAULT_MONTHLY_SALARY = 6500;
var DEFAULT_HOURS_PER_WEEK = 40;
var DEFAULT_WEEKS_PER_YEAR = 52;
var DEFAULT_ACTIVE_WINDOW_MINUTES = 5;
var DEFAULT_REFRESH_INTERVAL_SECONDS = 15;
var DEFAULT_LABEL = "dev";

// src/utils/parse-non-empty-string.ts
function parseNonEmptyString(value) {
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  if (!trimmed) return void 0;
  return trimmed;
}

// src/utils/is-finite-number.ts
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// src/utils/parse-positive-number.ts
function parsePositiveNumber(value) {
  if (!isFiniteNumber(value) || value <= 0) return void 0;
  return value;
}

// src/billing/parse-developer-cost-config.ts
function parseDeveloperCostConfig(options) {
  const rawMonthlySalary = options?.monthlySalary ?? DEFAULT_MONTHLY_SALARY;
  const rawHoursPerWeek = options?.hoursPerWeek ?? DEFAULT_HOURS_PER_WEEK;
  const rawWeeksPerYear = options?.weeksPerYear ?? DEFAULT_WEEKS_PER_YEAR;
  const rawActiveWindowMinutes = options?.activeWindowMinutes ?? DEFAULT_ACTIVE_WINDOW_MINUTES;
  const rawRefreshIntervalSeconds = options?.refreshIntervalSeconds ?? DEFAULT_REFRESH_INTERVAL_SECONDS;
  const rawLabel = options?.label ?? DEFAULT_LABEL;
  const parsedMonthlySalary = parsePositiveNumber(rawMonthlySalary);
  const monthlySalary = parsedMonthlySalary ?? DEFAULT_MONTHLY_SALARY;
  const parsedHoursPerWeek = parsePositiveNumber(rawHoursPerWeek);
  const hoursPerWeek = parsedHoursPerWeek ?? DEFAULT_HOURS_PER_WEEK;
  const parsedWeeksPerYear = parsePositiveNumber(rawWeeksPerYear);
  const weeksPerYear = parsedWeeksPerYear ?? DEFAULT_WEEKS_PER_YEAR;
  const parsedActiveWindowMinutes = parsePositiveNumber(rawActiveWindowMinutes);
  const activeWindowMinutes = parsedActiveWindowMinutes ?? DEFAULT_ACTIVE_WINDOW_MINUTES;
  const parsedRefreshIntervalSeconds = parsePositiveNumber(rawRefreshIntervalSeconds);
  const refreshIntervalSeconds = parsedRefreshIntervalSeconds ?? DEFAULT_REFRESH_INTERVAL_SECONDS;
  const parsedLabel = parseNonEmptyString(rawLabel);
  const label = parsedLabel?.toLowerCase() ?? DEFAULT_LABEL;
  return {
    monthlySalary,
    hoursPerWeek,
    weeksPerYear,
    activeWindowMinutes,
    refreshIntervalSeconds,
    label
  };
}

// src/utils/parse-decimal-string.ts
function parseDecimalString(value) {
  if (isFiniteNumber(value)) return big_default(value).toString();
  if (typeof value !== "string") return void 0;
  try {
    return big_default(value).toString();
  } catch {
    return void 0;
  }
}

// src/utils/parse-optional-number.ts
function parseOptionalNumber(value) {
  if (!isFiniteNumber(value)) return void 0;
  return value;
}

// src/billing/parse-developer-cost-state.ts
function parseDeveloperCostState(value) {
  if (typeof value !== "object" || value === null) return void 0;
  const candidate = value;
  const totalCost = parseDecimalString(candidate.totalCost);
  if (totalCost === void 0) return void 0;
  const rawActiveStartAtMs = candidate.activeStartAtMs;
  const rawActiveUntilMs = candidate.activeUntilMs;
  const rawLastSettledAtMs = candidate.lastSettledAtMs;
  const rawLastPromptAtMs = candidate.lastPromptAtMs;
  const rawPromptCount = candidate.promptCount ?? 0;
  const rawActiveMilliseconds = candidate.activeMilliseconds ?? 0;
  const activeStartAtMs = parseOptionalNumber(rawActiveStartAtMs);
  const activeUntilMs = parseOptionalNumber(rawActiveUntilMs);
  const lastSettledAtMs = parseOptionalNumber(rawLastSettledAtMs);
  const lastPromptAtMs = parseOptionalNumber(rawLastPromptAtMs);
  const promptCount = parseOptionalNumber(rawPromptCount) ?? 0;
  const activeMilliseconds = parseOptionalNumber(rawActiveMilliseconds) ?? 0;
  return {
    totalCost,
    promptCount,
    activeMilliseconds,
    activeStartAtMs,
    activeUntilMs,
    lastSettledAtMs,
    lastPromptAtMs
  };
}

// src/billing/settle-developer-cost-state.ts
function settleDeveloperCostState(state, nowMs, config) {
  const nextState = { ...state };
  if (nextState.activeStartAtMs === void 0 || nextState.activeUntilMs === void 0) {
    return nextState;
  }
  const settleFromMs = nextState.lastSettledAtMs ?? nextState.activeStartAtMs;
  const settleUntilMs = Math.min(nowMs, nextState.activeUntilMs);
  const elapsedMs = Math.max(0, settleUntilMs - settleFromMs);
  if (elapsedMs > 0) {
    const elapsedCost = costForActiveMs(config, elapsedMs);
    nextState.totalCost = big_default(nextState.totalCost).plus(elapsedCost).toString();
    nextState.activeMilliseconds += elapsedMs;
    nextState.lastSettledAtMs = settleUntilMs;
  }
  if (nowMs < nextState.activeUntilMs) {
    return nextState;
  }
  delete nextState.activeStartAtMs;
  delete nextState.activeUntilMs;
  delete nextState.lastSettledAtMs;
  return nextState;
}

// src/billing/record-developer-prompt.ts
function recordDeveloperPrompt(state, promptAtMs, config) {
  const nextState = settleDeveloperCostState(state, promptAtMs, config);
  const windowMs = activeWindowMs(config);
  if (nextState.activeStartAtMs === void 0 || nextState.activeUntilMs === void 0) {
    nextState.activeStartAtMs = promptAtMs;
    nextState.lastSettledAtMs = promptAtMs;
    nextState.activeUntilMs = promptAtMs + windowMs;
  } else {
    nextState.activeUntilMs = Math.max(nextState.activeUntilMs, promptAtMs + windowMs);
  }
  nextState.promptCount += 1;
  nextState.lastPromptAtMs = promptAtMs;
  return nextState;
}

// src/billing/refresh-interval-ms.ts
function refreshIntervalMs(config) {
  return config.refreshIntervalSeconds * MS_PER_SECOND;
}

// src/billing/window-rate.ts
function windowRate(config) {
  return costForActiveMs(config, activeWindowMs(config));
}

// src/billing/billing.ts
var Billing = class _Billing {
  static instance = new _Billing();
  constructor() {
  }
  parseConfig(options) {
    return parseDeveloperCostConfig(options);
  }
  emptyState() {
    return emptyDeveloperCostState();
  }
  parseState(value) {
    return parseDeveloperCostState(value);
  }
  recordPrompt(state, promptAtMs, config) {
    return recordDeveloperPrompt(state, promptAtMs, config);
  }
  settleState(state, nowMs, config) {
    return settleDeveloperCostState(state, nowMs, config);
  }
  displayedCost(state) {
    return displayedDeveloperCost(state);
  }
  formatCost(value) {
    return formatDeveloperCost(value);
  }
  activeWindowMs(config) {
    return activeWindowMs(config);
  }
  refreshIntervalMs(config) {
    return refreshIntervalMs(config);
  }
  windowRate(config) {
    return windowRate(config);
  }
  costForActiveMs(config, activeMs) {
    return costForActiveMs(config, activeMs);
  }
};

// src/billing/settle-spread-developer-cost-states.ts
function settleSpreadDeveloperCostStates(sessions, nowMs) {
  const activeWindows = sessions.flatMap(({ state }) => {
    if (state.activeStartAtMs === void 0 || state.activeUntilMs === void 0) return [];
    return [{
      startAtMs: state.activeStartAtMs,
      untilMs: state.activeUntilMs
    }];
  });
  return sessions.map((session) => ({
    ...session,
    state: settleSpreadDeveloperCostState(session.state, session.config, activeWindows, nowMs)
  }));
}
function settleSpreadDeveloperCostState(state, config, activeWindows, nowMs) {
  const nextState = { ...state };
  if (nextState.activeStartAtMs === void 0 || nextState.activeUntilMs === void 0) {
    return nextState;
  }
  const settleFromMs = nextState.lastSettledAtMs ?? nextState.activeStartAtMs;
  const settleUntilMs = Math.min(nowMs, nextState.activeUntilMs);
  const splitPoints = activeWindows.flatMap(({ startAtMs, untilMs }) => [startAtMs, untilMs]).filter((pointMs) => pointMs > settleFromMs && pointMs < settleUntilMs).sort((left, right) => left - right);
  const boundaries = [.../* @__PURE__ */ new Set([...splitPoints, settleUntilMs])];
  let segmentStartMs = settleFromMs;
  for (const segmentUntilMs of boundaries) {
    const elapsedMs = segmentUntilMs - segmentStartMs;
    const activeSessionCount = activeWindows.filter(
      ({ startAtMs, untilMs }) => startAtMs <= segmentStartMs && segmentStartMs < untilMs
    ).length;
    if (elapsedMs > 0 && activeSessionCount > 0) {
      const elapsedCost = costForActiveMs(config, elapsedMs).div(activeSessionCount);
      nextState.totalCost = big_default(nextState.totalCost).plus(elapsedCost).toString();
      nextState.activeMilliseconds += elapsedMs;
    }
    segmentStartMs = segmentUntilMs;
  }
  if (settleUntilMs > settleFromMs) {
    nextState.lastSettledAtMs = settleUntilMs;
  }
  if (nowMs < nextState.activeUntilMs) return nextState;
  delete nextState.activeStartAtMs;
  delete nextState.activeUntilMs;
  delete nextState.lastSettledAtMs;
  return nextState;
}

// src/config/plugin-name.ts
var PLUGIN_NAME = "omp-developer-attention-status";
var LEGACY_PLUGIN_NAME = "omp-developer-cost-status";

// src/config/read-developer-cost-config-file.ts
import fs from "node:fs";

// src/utils/is-enoent.ts
function isEnoent(error) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

// src/config/read-developer-cost-config-file.ts
async function readDeveloperCostConfigFile(filePath) {
  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (isEnoent(error)) return void 0;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read developer cost config at ${filePath}: ${message}`);
  }
}

// src/config/settings-for-plugin.ts
function settingsForPlugin(config, pluginName) {
  return config?.settings?.[pluginName] ?? {};
}

// src/load-developer-cost-config-from-files.ts
async function loadDeveloperCostConfigFromFiles(pluginsLockfile, projectPluginOverrides) {
  const [runtimeConfig, projectOverrides] = await Promise.all([
    readDeveloperCostConfigFile(pluginsLockfile),
    readDeveloperCostConfigFile(projectPluginOverrides)
  ]);
  const legacyGlobalSettings = settingsForPlugin(runtimeConfig, LEGACY_PLUGIN_NAME);
  const globalSettings = settingsForPlugin(runtimeConfig, PLUGIN_NAME);
  const legacyProjectSettings = settingsForPlugin(projectOverrides, LEGACY_PLUGIN_NAME);
  const projectSettings = settingsForPlugin(projectOverrides, PLUGIN_NAME);
  const mergedSettings = {
    ...legacyGlobalSettings,
    ...globalSettings,
    ...legacyProjectSettings,
    ...projectSettings
  };
  return parseDeveloperCostConfig(mergedSettings);
}

// src/config/plugins-lockfile-path.ts
import { homedir } from "node:os";
import path from "node:path";
function pluginsLockfilePath() {
  return path.join(homedir(), ".omp", "plugins", "omp-plugins.lock.json");
}

// src/config/project-plugin-overrides-path.ts
import path2 from "node:path";
function projectPluginOverridesPath(cwd) {
  return path2.join(cwd, ".omp", "plugin-overrides.json");
}

// src/load-developer-cost-config.ts
function loadDeveloperCostConfig(cwd) {
  const pluginsLockfile = pluginsLockfilePath();
  const projectPluginOverrides = projectPluginOverridesPath(cwd);
  return loadDeveloperCostConfigFromFiles(pluginsLockfile, projectPluginOverrides);
}

// src/status-presenter.ts
var STATUS_KEY = "developer-cost-status";
function updateStatus(ctx, state, config) {
  ctx.ui.setStatus(
    STATUS_KEY,
    ctx.ui.theme.fg("dim", statusText(state, config))
  );
}
function clearStatus(ctx) {
  ctx.ui.setStatus(STATUS_KEY, void 0);
}
function statusText(state, config) {
  const text = formatDeveloperCost(displayedDeveloperCost(state));
  return `${text} (${config.label})`;
}
function summaryText(state, config, sessionId, nowMs) {
  const lastPromptAtMs = state.lastPromptAtMs;
  let lastPrompt = "Last prompt: unavailable";
  if (lastPromptAtMs !== void 0) {
    const lastPromptAt = new Date(lastPromptAtMs);
    if (!Number.isNaN(lastPromptAt.getTime())) {
      lastPrompt = `Last prompt: ${durationText(nowMs - lastPromptAtMs)} ago (${lastPromptAt.toISOString()})`;
    }
  }
  return [
    "Developer cost summary",
    `Session: ${sessionId}`,
    `Cost: ${statusText(state, config)}`,
    `Active time: ${durationText(state.activeMilliseconds)}`,
    `Prompt count: ${state.promptCount}`,
    lastPrompt
  ].join("\n");
}
function durationText(milliseconds) {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1e3);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
function errorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

// src/session-state.ts
var DEVELOPER_COST_STATE_ENTRY = "developer-cost-status.state";
function loadPersistedDeveloperCostState(entries) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.type !== "custom") continue;
    if (entry.customType !== DEVELOPER_COST_STATE_ENTRY) continue;
    const state = parseDeveloperCostState(entry.data);
    if (state !== void 0) return state;
  }
  return emptyDeveloperCostState();
}

// src/spread-billing-ledger.ts
var import_proper_lockfile = __toESM(require_proper_lockfile(), 1);
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir as homedir2 } from "node:os";
import path3 from "node:path";
var SpreadBillingLedger = class {
  filePath;
  constructor(filePath) {
    this.filePath = filePath ?? path3.join(
      homedir2(),
      ".omp",
      "developer-cost-status",
      "spread-billing.json"
    );
  }
  async recordPrompt(sessionId, state, promptAtMs, config) {
    return this.update(sessionId, state, promptAtMs, config, "prompt");
  }
  async settle(sessionId, state, nowMs, config) {
    return this.update(sessionId, state, nowMs, config, "settle");
  }
  async update(sessionId, state, nowMs, config, updateKind) {
    return this.withLock(async () => {
      const ledger = await this.readLedger();
      const settlementAtMs = Math.max(nowMs, ledger.settledThroughMs);
      const existingSession = ledger.sessions.get(sessionId);
      const currentState = existingSession?.state ?? { ...state };
      if (existingSession === void 0 && currentState.activeStartAtMs !== void 0 && currentState.activeUntilMs !== void 0) {
        const settledFromMs = currentState.lastSettledAtMs ?? currentState.activeStartAtMs;
        currentState.lastSettledAtMs = Math.max(settledFromMs, ledger.settledThroughMs);
      }
      ledger.sessions.set(sessionId, {
        state: currentState,
        config
      });
      const settledSessions = settleSpreadDeveloperCostStates(
        [...ledger.sessions].map(([id, entry]) => ({
          sessionId: id,
          state: entry.state,
          config: entry.config
        })),
        settlementAtMs
      );
      ledger.sessions.clear();
      for (const settledSession2 of settledSessions) {
        ledger.sessions.set(settledSession2.sessionId, {
          state: settledSession2.state,
          config: settledSession2.config
        });
      }
      ledger.settledThroughMs = settlementAtMs;
      const settledSession = ledger.sessions.get(sessionId);
      if (settledSession === void 0) {
        throw new Error(`Developer cost status cannot settle session ${sessionId}.`);
      }
      let nextState = settledSession.state;
      if (updateKind === "prompt") {
        nextState = recordDeveloperPrompt(settledSession.state, settlementAtMs, config);
        nextState.lastPromptAtMs = Math.max(
          nowMs,
          settledSession.state.lastPromptAtMs ?? nowMs
        );
      }
      ledger.sessions.set(sessionId, { state: nextState, config });
      await this.writeLedger(ledger);
      return nextState;
    });
  }
  async withLock(operation) {
    const parentPath = path3.dirname(this.filePath);
    await mkdir(parentPath, { recursive: true });
    const release = await (0, import_proper_lockfile.lock)(this.filePath, {
      realpath: false,
      stale: 6e4,
      update: 3e4,
      retries: {
        forever: true,
        factor: 1.5,
        minTimeout: 100,
        maxTimeout: 1e3
      }
    });
    let operationFailed = false;
    try {
      return await operation();
    } catch (error) {
      operationFailed = true;
      throw error;
    } finally {
      try {
        await release();
      } catch (error) {
        if (!operationFailed) throw error;
      }
    }
  }
  async readLedger() {
    let content;
    try {
      content = await readFile(this.filePath, "utf8");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return {
          sessions: /* @__PURE__ */ new Map(),
          settledThroughMs: 0
        };
      }
      throw error;
    }
    let value;
    try {
      value = JSON.parse(content);
    } catch {
      throw new Error("Developer cost status spread billing state is unreadable.");
    }
    if (typeof value !== "object" || value === null || !("sessions" in value) || typeof value.sessions !== "object" || value.sessions === null || Array.isArray(value.sessions)) {
      throw new Error("Developer cost status spread billing state is invalid.");
    }
    const rawSettledThroughMs = "settledThroughMs" in value ? value.settledThroughMs : 0;
    if (typeof rawSettledThroughMs !== "number" || !Number.isFinite(rawSettledThroughMs)) {
      throw new Error("Developer cost status spread billing state is invalid.");
    }
    const sessions = /* @__PURE__ */ new Map();
    for (const [sessionId, entry] of Object.entries(value.sessions)) {
      if (typeof entry !== "object" || entry === null || !("state" in entry) || !("config" in entry) || !isStoredConfig(entry.config)) {
        throw new Error("Developer cost status spread billing state is invalid.");
      }
      const state = parseDeveloperCostState(entry.state);
      if (state === void 0) {
        throw new Error("Developer cost status spread billing state is invalid.");
      }
      sessions.set(sessionId, {
        state,
        config: entry.config
      });
    }
    return {
      sessions,
      settledThroughMs: rawSettledThroughMs
    };
  }
  async writeLedger(ledger) {
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    const sessions = Object.fromEntries(ledger.sessions);
    const content = JSON.stringify({
      settledThroughMs: ledger.settledThroughMs,
      sessions
    });
    await writeFile(temporaryPath, content);
    await rename(temporaryPath, this.filePath);
  }
};
function isStoredConfig(value) {
  if (typeof value !== "object" || value === null) return false;
  if (!("monthlySalary" in value) || !("hoursPerWeek" in value) || !("weeksPerYear" in value) || !("activeWindowMinutes" in value) || !("refreshIntervalSeconds" in value) || !("label" in value)) {
    return false;
  }
  const monthlySalary = value.monthlySalary;
  const hoursPerWeek = value.hoursPerWeek;
  const weeksPerYear = value.weeksPerYear;
  const activeWindowMinutes = value.activeWindowMinutes;
  const refreshIntervalSeconds = value.refreshIntervalSeconds;
  const label = value.label;
  return typeof monthlySalary === "number" && Number.isFinite(monthlySalary) && monthlySalary > 0 && typeof hoursPerWeek === "number" && Number.isFinite(hoursPerWeek) && hoursPerWeek > 0 && typeof weeksPerYear === "number" && Number.isFinite(weeksPerYear) && weeksPerYear > 0 && typeof activeWindowMinutes === "number" && Number.isFinite(activeWindowMinutes) && activeWindowMinutes > 0 && typeof refreshIntervalSeconds === "number" && Number.isFinite(refreshIntervalSeconds) && refreshIntervalSeconds > 0 && typeof label === "string" && label.length > 0;
}

// src/session-classification.ts
function isTopLevelSession(sessionManager) {
  const header = sessionManager.getHeader();
  if (header === null) return true;
  return typeof header.parentSession !== "string" || header.parentSession.length === 0;
}

// src/developer-cost-status-runtime.ts
var DEFAULT_REFRESH_INTERVAL_MS = refreshIntervalMs(parseDeveloperCostConfig());
var DeveloperCostStatusRuntime = class {
  pi;
  loadConfig;
  ledger;
  runtimeState = {};
  sessionStates = /* @__PURE__ */ new Map();
  constructor(pi, options = {}) {
    this.pi = pi;
    this.loadConfig = options.loadConfig ?? loadDeveloperCostConfig;
    this.ledger = new SpreadBillingLedger(options.ledgerPath);
  }
  register() {
    this.scheduleNextRefresh();
    this.pi.registerCommand("developer-cost-status", {
      description: "Show developer cost or attention summary for the current session",
      handler: async (args, ctx) => {
        await this.showCurrentStatus(args, ctx);
      }
    });
    this.pi.on("session_start", async (_event, ctx) => {
      await this.activateSession(ctx);
    });
    this.pi.on("session_switch", async (_event, ctx) => {
      await this.activateSession(ctx);
    });
    this.pi.on("before_agent_start", async (_event, ctx) => {
      await this.recordPrompt(ctx);
    });
    this.pi.on("turn_end", async (_event, ctx) => {
      await this.settleCurrentTurn(ctx);
    });
    this.pi.on("session_shutdown", async (_event, ctx) => {
      this.shutdownSession(ctx);
    });
  }
  async showCurrentStatus(args, ctx) {
    if (!isTopLevelSession(ctx.sessionManager)) {
      ctx.ui.notify("Developer cost status is only tracked for top-level sessions.", "info");
      return;
    }
    const config = await this.loadConfigForStatus(ctx);
    if (config === void 0) return;
    const sessionId = ctx.sessionManager.getSessionId();
    const state = this.stateForSession(ctx, sessionId);
    const nowMs = Date.now();
    const settledState = await this.ledger.settle(sessionId, state, nowMs, config);
    this.sessionStates.set(sessionId, settledState);
    const message = args.trim() === "summary" ? summaryText(settledState, config, sessionId, nowMs) : statusText(settledState, config);
    ctx.ui.notify(message, "info");
  }
  async activateSession(ctx) {
    if (!isTopLevelSession(ctx.sessionManager)) return;
    const config = await this.loadConfigForStatus(ctx);
    if (config === void 0) {
      this.clearActiveStatus(ctx);
      return;
    }
    const sessionId = ctx.sessionManager.getSessionId();
    const state = loadPersistedDeveloperCostState(ctx.sessionManager.getEntries());
    const settledState = await this.ledger.settle(sessionId, state, Date.now(), config);
    this.sessionStates.set(sessionId, settledState);
    this.rememberActiveSession(ctx, sessionId, settledState);
    if (settledState.activeUntilMs === void 0) {
      this.clearActiveStatus(ctx);
      return;
    }
    updateStatus(ctx, settledState, config);
  }
  async recordPrompt(ctx) {
    if (!isTopLevelSession(ctx.sessionManager)) return;
    const config = await this.loadConfigForStatus(ctx);
    if (config === void 0) {
      this.clearActiveStatus(ctx);
      return;
    }
    const sessionId = ctx.sessionManager.getSessionId();
    const currentState = this.stateForSession(ctx, sessionId);
    const promptAtMs = Date.now();
    const nextState = await this.ledger.recordPrompt(
      sessionId,
      currentState,
      promptAtMs,
      config
    );
    this.sessionStates.set(sessionId, nextState);
    this.runtimeState.activeContext = ctx;
    this.runtimeState.activeSessionId = sessionId;
    this.pi.appendEntry(DEVELOPER_COST_STATE_ENTRY, nextState);
    updateStatus(ctx, nextState, config);
  }
  async settleCurrentTurn(ctx) {
    if (!isTopLevelSession(ctx.sessionManager)) return;
    const config = await this.loadConfigForStatus(ctx);
    if (config === void 0) {
      this.clearActiveStatus(ctx);
      return;
    }
    const sessionId = ctx.sessionManager.getSessionId();
    const currentState = this.stateForSession(ctx, sessionId);
    const settledState = await this.ledger.settle(sessionId, currentState, Date.now(), config);
    this.sessionStates.set(sessionId, settledState);
    this.pi.appendEntry(DEVELOPER_COST_STATE_ENTRY, settledState);
    this.rememberActiveSession(ctx, sessionId, settledState);
    updateStatus(ctx, settledState, config);
  }
  shutdownSession(ctx) {
    const sessionId = ctx.sessionManager.getSessionId();
    this.sessionStates.delete(sessionId);
    if (this.runtimeState.activeSessionId !== sessionId) return;
    this.clearActiveStatus(ctx);
  }
  async refreshActiveStatus() {
    if (this.runtimeState.activeContext === void 0 || this.runtimeState.activeSessionId === void 0) {
      return DEFAULT_REFRESH_INTERVAL_MS;
    }
    const activeContext = this.runtimeState.activeContext;
    const activeSessionId = this.runtimeState.activeSessionId;
    const config = await this.loadConfigForStatus(activeContext);
    if (config === void 0) {
      this.clearActiveStatus(activeContext);
      return DEFAULT_REFRESH_INTERVAL_MS;
    }
    const currentState = this.stateForSession(activeContext, activeSessionId);
    const settledState = await this.ledger.settle(
      activeSessionId,
      currentState,
      Date.now(),
      config
    );
    this.sessionStates.set(activeSessionId, settledState);
    this.pi.appendEntry(DEVELOPER_COST_STATE_ENTRY, settledState);
    this.rememberActiveSession(activeContext, activeSessionId, settledState);
    updateStatus(activeContext, settledState, config);
    return refreshIntervalMs(config);
  }
  scheduleNextRefresh(waitMs = DEFAULT_REFRESH_INTERVAL_MS) {
    clearTimeout(this.runtimeState.refreshTimer);
    const timer = setTimeout(async () => {
      this.runtimeState.refreshTimer = void 0;
      try {
        const nextWaitMs = await this.refreshActiveStatus();
        this.scheduleNextRefresh(nextWaitMs);
      } catch (error) {
        this.reportUnexpectedRefreshError(error);
        this.scheduleNextRefresh();
      }
    }, waitMs);
    timer.unref?.();
    this.runtimeState.refreshTimer = timer;
  }
  reportUnexpectedRefreshError(error) {
    const activeContext = this.runtimeState.activeContext;
    if (activeContext === void 0) return;
    activeContext.ui.notify(
      `Developer cost status refresh error: ${errorMessage(error)}`,
      "error"
    );
    this.clearActiveStatus(activeContext);
  }
  async loadConfigForStatus(ctx) {
    try {
      return await this.loadConfig(ctx.cwd);
    } catch (error) {
      ctx.ui.notify(`Developer cost status config error: ${errorMessage(error)}`, "error");
      return void 0;
    }
  }
  rememberActiveSession(ctx, sessionId, state) {
    if (state.activeUntilMs === void 0) {
      this.runtimeState.activeContext = void 0;
      this.runtimeState.activeSessionId = void 0;
      return;
    }
    this.runtimeState.activeContext = ctx;
    this.runtimeState.activeSessionId = sessionId;
  }
  clearActiveStatus(ctx) {
    clearStatus(ctx);
    this.runtimeState.activeContext = void 0;
    this.runtimeState.activeSessionId = void 0;
  }
  stateForSession(ctx, sessionId) {
    return this.sessionStates.get(sessionId) ?? loadPersistedDeveloperCostState(ctx.sessionManager.getEntries());
  }
};

// src/index.ts
function developerCostStatusExtension(pi, options = {}) {
  const runtime = new DeveloperCostStatusRuntime(pi, options);
  runtime.register();
}
export {
  developerCostStatusExtension as default,
  loadDeveloperCostConfigFromFiles
};
