package main

import (
	"net/http"
	// "code.google.com/p/go.net/websocket"
	"encoding/json"
	"fmt"
	"github.com/ziutek/mymysql/mysql"
	_ "github.com/ziutek/mymysql/native"
	"log"
	"os"
	"time"
)

func execute(db mysql.Conn, query string, w http.ResponseWriter) {

	before := time.Now()

	rawRows, res, err := db.Query(query)
	if err != nil {
		fmt.Fprintln(w, "Error occured:", err)
		return
	}

	total_ns := time.Now().UnixNano() - before.UnixNano()

	result := make(map[string]interface{})

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

	result["time_ns"] = total_ns

	serialized, err := json.MarshalIndent(result, "", " ")

	if err != nil {
		fmt.Fprint(w, "Cannot serialize JSON:", err)
	} else {
		fmt.Fprintf(w, "%s", serialized)
	}
}

func mysqlHandler(w http.ResponseWriter, r *http.Request) {
	db := mysql.New("tcp", "", "127.0.0.1:3306", "root", "root", "")
	err := db.Connect()
	if err != nil {
		panic(err)
	}

	defer db.Close()

	err = r.ParseForm()
	if err != nil {
		fmt.Fprint(os.Stderr, "Cannot parse input")
		return
	}

	w.Header().Add("Content-type", "application/json")

	query := r.Form.Get("query")
	execute(db, query, w)
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

	http.HandleFunc("/mysql", mysqlHandler)
	err := http.ListenAndServe(":8080", nil)

	if err != nil {
		log.Fatal("Could not start HTTP server: ", err)
	}

}
