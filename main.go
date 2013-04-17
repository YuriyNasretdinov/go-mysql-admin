package main

import (
	"code.google.com/p/go.net/websocket"
	"encoding/json"
	"fmt"
	"github.com/ziutek/mymysql/mysql"
	_ "github.com/ziutek/mymysql/native"
	"io"
	"log"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const (
	MAX_QUERY_SIZE = 16 * 1024 * 1024
)

func execute(db mysql.Conn, query string, ws *websocket.Conn) {

	before := time.Now()

	result := make(map[string]interface{})
	rawRows, res, err := db.Query(query)
	if err != nil {
		result["err"] = err.Error()
	} else {
		fieldNames := make([]string, len(res.Fields()))
		for k, field := range res.Fields() {
			fieldNames[k] = field.Name
		}

		result["fields"] = fieldNames

		rows := make([]interface{}, len(rawRows))

		for rowNum, rawRow := range rawRows {
			row := make([]interface{}, len(fieldNames))

			for k, col := range rawRow {
				switch val := col.(type) {
				case []byte:
					row[k] = string(val)
				case nil:
					row[k] = val
				default:
					row[k] = fmt.Sprint(col)
				}
			}

			rows[rowNum] = row
		}

		result["rows"] = rows
	}

	total_ns := time.Now().UnixNano() - before.UnixNano()

	result["time_ns"] = total_ns
	result["affected_rows"] = res.AffectedRows()

	serialized, err := json.MarshalIndent(result, "", " ")

	if err != nil {
		fmt.Fprint(ws, "Cannot serialize JSON:", err)
	} else {
		n, err := ws.Write(serialized)
		if n != len(serialized) {
			panic("Could not send full result")
		}

		if err != nil {
			panic(err)
		}
	}
}

func readFull(r io.Reader, buf []byte) {
	_, err := io.ReadFull(r, buf)
	if err != nil {
		panic(fmt.Sprintf("Could not read fully from %v: %s", r, err))
	}
}

func readInt(r io.Reader) int {
	var buf [8]byte
	readFull(r, buf[:])
	result, err := strconv.Atoi(strings.TrimSpace(string(buf[:])))
	if err != nil {
		panic(fmt.Sprintf("Could not convert input from %v to int: %s", r, err))
	}
	return result
}

func mysqlHandler(ws *websocket.Conn) {
	defer func() {
		if r := recover(); r != nil {
			fmt.Fprintf(os.Stderr, "Error occured: %s\n", r)
			runtime.Goexit()
		}
	}()

	db := mysql.New("tcp", "", "127.0.0.1:3306", "root", "root", "")
	err := db.Connect()
	if err != nil {
		panic(err)
	}
	defer db.Close()

	for {
		queryLen := readInt(ws)
		if queryLen > MAX_QUERY_SIZE {
			fmt.Fprint(os.Stderr, "Too long query:", queryLen)
			return
		}

		queryBytes := make([]byte, queryLen)
		_, err = io.ReadFull(ws, queryBytes)
		if err != nil {
			panic("Cannot read request")
		}

		query := string(queryBytes)
		execute(db, query, ws)
	}
}

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		url := r.URL.RequestURI()
		if len(url) < 2 {
			url = "index.html"
		} else {
			url = url[1:]
		}
		http.ServeFile(w, r, url)
	})

	http.Handle("/mysql", websocket.Handler(mysqlHandler))
	err := http.ListenAndServe(":8080", nil)

	if err != nil {
		log.Fatal("Could not start HTTP server: ", err)
	}

}
