function drawResponse(data) {
  $('#query-ms').html(Math.floor(data['time_ns'] / 1000000))
  $('#affected-rows').html(data['affected_rows'])

  if (data.err) {
    $('#query-result').html('<b>Error:</b> ' + data.err);
    return;
  }

  if (!data.fields.length) {
    $('#query-result').html('<i>Query executed successfully. Got empty resultset</i>');
    return;
  }

  var fields = data.fields;
  var rows = data.rows;

  try {
    grid.destroy();
  } catch (e) {
  }
  
  grid = new GGGR();
  grid.container = document.getElementById('query-result');

  grid.fields = {};
  for (var i = 0; i < fields.length; i++) grid.fields['_' + i] = fields[i];

  grid.dataSource = {
    type: 'local',
    fetch: function(idx) {
      var row = rows[idx];
      var result = {};
      for (var i = 0; i < row.length; i++) {
        result['_' + i] = row[i] === null ? '<i>NULL</i>' : htmlspecialchars(row[i]);
      }

      return result;
    },
    count: function() { return rows.length; }
  };
  grid.setup();
}

function query(str, callback) {
  result_callback = callback;
  send_cmd(str);
}

function absolutize($el) {
  $el.css({
    width: $el.width() + 'px',
    height: $el.height() + 'px'
  })
}

function selectDatabase(val) {
  $('#database').attr('disabled', true);
  query("USE " + val, function(data) {
    if (data.err) {
      alert(data.err);
      return;
    }

    query("SHOW TABLES", function(data) {
      if (data.err) {
        alert(data.err);
        return;
      }

      global_tables = [];
      for (var i = 0; i < data.rows.length; i++) global_tables[i] = data.rows[i][0];
      drawTables(global_tables);

      $('#info').html('');
      $('#database').attr('disabled', false);
      $('#search').val('').focus();
    });
  });
}

function reloadDatabases() {
  query("SHOW DATABASES", function(data) {
    if (data.err) {
      alert(data.err);
      return;
    }

    var lst = ['<option value="">Select database...</option>'];
    for (var i = 0; i < data.rows.length; i++) {
      var name = data.rows[i][0];
      lst.push('<option value="' + htmlspecialchars(name) + '">' + htmlspecialchars(name) + '</option>');
    }

    $('#database').html(lst.join("\n"));
  });
}

function filterTables() {
  var q = $('#search').val();
  var tables = []
  if (q == '') {
    tables = global_tables;
  } else {
    for (var i = 0; i < global_tables.length; i++) {
      if (global_tables[i].indexOf(q) != -1) tables.push(global_tables[i]);
    }
  }
  drawTables(tables);
}

function drawTables(tables) {
  var result = ['<ul class="nav nav-list"><li class="nav-header">Tables</li>'];
  for (var i = 0; i < tables.length; i++) {
    var name = htmlspecialchars(tables[i]);
    result.push('<li><a href="#" class="table_name" data-name="' + name + '"><i class="icon-th"></i>' + name + '</a></li>')
  }
  result.push('</ul>');
  $('#tables').html(result.join("\n")).find('.table_name').bind('click', function() {
    var name = $(this).data('name');
    var className = 'active';
    $('#tables').find('.' + className).removeClass(className);
    $(this.parentNode).addClass(className);
    query("SHOW TABLE STATUS LIKE '" + name + "'", function(data) {
      if (data.err) {
        alert(data.err);
        return;
      }

      var fields = data.fields;
      var row = data.rows[0];

      var rowAssoc = {};
      for (var i = 0; i < fields.length; i++) rowAssoc[fields[i]] = row[i];

      $('#query').val('SELECT * FROM ' + name + ' LIMIT 1000').focus();

      $('#info').html(
        '<div><b>Engine:</b> ' + htmlspecialchars(rowAssoc['Engine']) + '</div>' +
        '<div><b>Est. Rows:</b> ' + htmlspecialchars(rowAssoc['Rows']) + '</div>' +
        '<div><b>Size:</b> ' + humanSize(parseInt(rowAssoc['Data_length']) + parseInt(rowAssoc['Index_length'])) + '</div>'
      );
    });
    return false;
  });
}

function humanSize(bytes) {
  if (bytes < 1024) return bytes + ' bytes';
  if (bytes < 1024*1024) return Math.floor(bytes / 1024) + ' Kb';
  if (bytes < 1024*1024*1024) return Math.floor(bytes / 1024 / 1024) + ' Mb';
  return Math.floor(bytes / 1024 / 1024 / 1024) + ' Gb';
}

function string_utf8_len(str) {
  var len = 0, l = str.length;

  for (var i = 0; i < l; i++) {
    var c = str.charCodeAt(i);
    if (c <= 0x0000007F) len++;
    else if (c >= 0x00000080 && c <= 0x000007FF) len += 2;
    else if (c >= 0x00000800 && c <= 0x0000FFFF) len += 3;
    else len += 4;
  }

  return len;
}

function indent(str) {
  str = '' + str
  while (str.length < 8) str += ' '
  return str
}

function send_cmd(val) {
  $('#execute-btn').attr('disabled', true);
  ws.send(indent(string_utf8_len(val + ''), 8) + val)
}

function htmlspecialchars (string, quote_style, charset, double_encode) {
  // http://kevin.vanzonneveld.net
  // +   original by: Mirek Slugen
  // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
  // +   bugfixed by: Nathan
  // +   bugfixed by: Arno
  // +    revised by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
  // +    bugfixed by: Brett Zamir (http://brett-zamir.me)
  // +      input by: Ratheous
  // +      input by: Mailfaker (http://www.weedem.fr/)
  // +      reimplemented by: Brett Zamir (http://brett-zamir.me)
  // +      input by: felix
  // +    bugfixed by: Brett Zamir (http://brett-zamir.me)
  // %        note 1: charset argument not supported
  // *     example 1: htmlspecialchars("<a href='test'>Test</a>", 'ENT_QUOTES');
  // *     returns 1: '&lt;a href=&#039;test&#039;&gt;Test&lt;/a&gt;'
  // *     example 2: htmlspecialchars("ab\"c'd", ['ENT_NOQUOTES', 'ENT_QUOTES']);
  // *     returns 2: 'ab"c&#039;d'
  // *     example 3: htmlspecialchars("my "&entity;" is still here", null, null, false);
  // *     returns 3: 'my &quot;&entity;&quot; is still here'
  var optTemp = 0,
    i = 0,
    noquotes = false;
  if (typeof quote_style === 'undefined' || quote_style === null) {
    quote_style = 2;
  }
  string = string.toString();
  if (double_encode !== false) { // Put this first to avoid double-encoding
    string = string.replace(/&/g, '&amp;');
  }
  string = string.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  var OPTS = {
    'ENT_NOQUOTES': 0,
    'ENT_HTML_QUOTE_SINGLE': 1,
    'ENT_HTML_QUOTE_DOUBLE': 2,
    'ENT_COMPAT': 2,
    'ENT_QUOTES': 3,
    'ENT_IGNORE': 4
  };
  if (quote_style === 0) {
    noquotes = true;
  }
  if (typeof quote_style !== 'number') { // Allow for a single string or an array of string flags
    quote_style = [].concat(quote_style);
    for (i = 0; i < quote_style.length; i++) {
      // Resolve string input to bitwise e.g. 'ENT_IGNORE' becomes 4
      if (OPTS[quote_style[i]] === 0) {
        noquotes = true;
      }
      else if (OPTS[quote_style[i]]) {
        optTemp = optTemp | OPTS[quote_style[i]];
      }
    }
    quote_style = optTemp;
  }
  if (quote_style & OPTS.ENT_HTML_QUOTE_SINGLE) {
    string = string.replace(/'/g, '&#039;');
  }
  if (!noquotes) {
    string = string.replace(/"/g, '&quot;');
  }

  return string;
}